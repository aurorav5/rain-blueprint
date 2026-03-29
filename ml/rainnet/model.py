import torch
import torch.nn as nn
from typing import Optional


class MelSpecEncoder(nn.Module):
    def __init__(self, output_dim: int = 256) -> None:
        super().__init__()
        self.convs = nn.Sequential(
            nn.Conv2d(1, 128, 3, padding=1), nn.GELU(), nn.LayerNorm([128, 128, 128]),
            nn.Conv2d(128, 256, 3, padding=1, stride=2), nn.GELU(),
            nn.Conv2d(256, 256, 3, padding=1, stride=2), nn.GELU(),
        )
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.proj = nn.Linear(256, output_dim)

    def forward(self, mel: torch.Tensor) -> torch.Tensor:
        # mel: [B, 1, 128, 128]
        x = self.convs(mel)
        x = self.pool(x).squeeze(-1).squeeze(-1)
        return self.proj(x)


class RainNetV2(nn.Module):
    N_PARAMS: int = 32

    def __init__(
        self,
        d_model: int = 256,
        n_heads: int = 8,
        n_layers: int = 4,
        n_genres: int = 87,
        n_platforms: int = 8,
    ) -> None:
        super().__init__()
        self.d_model = d_model
        self.mel_encoder = MelSpecEncoder(d_model)
        self.artist_proj = nn.Sequential(nn.Linear(64, d_model), nn.GELU())
        self.genre_embed = nn.Sequential(nn.Embedding(n_genres, 64), nn.Linear(64, d_model))
        self.platform_embed = nn.Sequential(nn.Embedding(n_platforms, 32), nn.Linear(32, d_model))
        self.mode_proj = nn.Sequential(nn.Linear(1, 32), nn.GELU(), nn.Linear(32, d_model))
        self.cls_token = nn.Parameter(torch.randn(1, 1, d_model))
        self.pos_embed = nn.Parameter(torch.randn(1, 6, d_model))
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model, nhead=n_heads, dim_feedforward=1024,
            activation="gelu", batch_first=True, norm_first=True,
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=n_layers)
        self.decoder = nn.Sequential(
            nn.Linear(d_model, 512), nn.GELU(),
            nn.Linear(512, 256), nn.GELU(),
            nn.Linear(256, self.N_PARAMS),
        )

    def forward(
        self,
        mel: torch.Tensor,           # [B, 1, 128, 128]
        artist_vec: torch.Tensor,    # [B, 64]
        genre_id: torch.Tensor,      # [B] int64
        platform_id: torch.Tensor,   # [B] int64
        simple_mode: torch.Tensor,   # [B, 1] float32
    ) -> torch.Tensor:
        B = mel.shape[0]
        mel_tok = self.mel_encoder(mel).unsqueeze(1)
        art_tok = self.artist_proj(artist_vec).unsqueeze(1)
        gen_tok = self.genre_embed(genre_id).unsqueeze(1)
        plt_tok = self.platform_embed(platform_id).unsqueeze(1)
        mod_tok = self.mode_proj(simple_mode).unsqueeze(1)
        cls = self.cls_token.expand(B, -1, -1)
        tokens = torch.cat([cls, mel_tok, art_tok, gen_tok, plt_tok, mod_tok], dim=1)
        tokens = tokens + self.pos_embed
        out = self.transformer(tokens)
        cls_out = out[:, 0, :]
        return self.decoder(cls_out)

    def decode_params(self, raw: torch.Tensor) -> dict:
        """Convert raw model output to ProcessingParams-compatible dict."""
        p = raw.squeeze(0)
        return {
            "mb_threshold_low":  float(torch.sigmoid(p[0]) * -40),
            "mb_threshold_mid":  float(torch.sigmoid(p[1]) * -40),
            "mb_threshold_high": float(torch.sigmoid(p[2]) * -40),
            "mb_ratio_low":      float(nn.functional.softplus(p[3]) + 1.0),
            "mb_ratio_mid":      float(nn.functional.softplus(p[4]) + 1.0),
            "mb_ratio_high":     float(nn.functional.softplus(p[5]) + 1.0),
            "mb_attack_low":     float(nn.functional.softplus(p[6])),
            "mb_attack_mid":     float(nn.functional.softplus(p[7])),
            "mb_attack_high":    float(nn.functional.softplus(p[8])),
            "mb_release_low":    float(nn.functional.softplus(p[9]) * 10),
            "mb_release_mid":    float(nn.functional.softplus(p[10]) * 10),
            "mb_release_high":   float(nn.functional.softplus(p[11]) * 10),
            "eq_gains":          [float(torch.tanh(p[12 + i]) * 12) for i in range(8)],
            "analog_saturation": bool(torch.sigmoid(p[20]) > 0.5),
            "saturation_drive":  float(torch.sigmoid(p[21])),
            "saturation_mode":   "tape",
            "ms_enabled":        bool(torch.sigmoid(p[22]) > 0.5),
            "mid_gain":          float(torch.tanh(p[23]) * 6),
            "side_gain":         float(torch.tanh(p[24]) * 6),
            "stereo_width":      float(torch.sigmoid(p[25]) * 2),
            "sail_enabled":      bool(torch.sigmoid(p[26]) > 0.5),
            "sail_stem_gains":   [float(torch.tanh(p[27 + i]) * 3) for i in range(5)] + [0.0],
            # target_lufs and true_peak_ceiling are set by platform, not predicted
            "target_lufs":       -14.0,
            "true_peak_ceiling": -1.0,
            "vinyl_mode":        False,
        }
