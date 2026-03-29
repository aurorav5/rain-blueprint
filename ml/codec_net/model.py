"""CodecNet: predicts per-band codec penalty per target platform."""
import torch
import torch.nn as nn


class CodecNet(nn.Module):
    N_BANDS: int = 8
    N_PLATFORMS: int = 8

    def __init__(self) -> None:
        super().__init__()
        self.mel_encoder = nn.Sequential(
            nn.Conv2d(1, 64, 3, padding=1, stride=2), nn.GELU(),
            nn.Conv2d(64, 128, 3, padding=1, stride=2), nn.GELU(),
            nn.AdaptiveAvgPool2d(1),
        )
        self.platform_embed = nn.Embedding(self.N_PLATFORMS, 32)
        self.head = nn.Sequential(
            nn.Linear(128 + 32, 256), nn.GELU(),
            nn.Linear(256, self.N_BANDS * self.N_PLATFORMS),
        )

    def forward(self, mel: torch.Tensor, platform_id: torch.Tensor) -> torch.Tensor:
        # mel: [B, 1, 128, 128], platform_id: [B]
        mel_feat = self.mel_encoder(mel).squeeze(-1).squeeze(-1)   # [B, 128]
        plat_feat = self.platform_embed(platform_id)               # [B, 32]
        combined = torch.cat([mel_feat, plat_feat], dim=-1)
        out = self.head(combined)
        return out.view(-1, self.N_BANDS, self.N_PLATFORMS)        # [B, 8, 8]
