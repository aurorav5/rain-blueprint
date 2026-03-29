"""ReferenceEncoder: produces 64-dim artist/style embeddings from mel spectrogram."""
import torch
import torch.nn as nn


class ReferenceEncoder(nn.Module):
    EMBEDDING_DIM: int = 64

    def __init__(self) -> None:
        super().__init__()
        # Shares architecture with RainNetV2.MelSpecEncoder, fine-tuned separately
        self.convs = nn.Sequential(
            nn.Conv2d(1, 128, 3, padding=1), nn.GELU(),
            nn.Conv2d(128, 256, 3, padding=1, stride=2), nn.GELU(),
            nn.Conv2d(256, 256, 3, padding=1, stride=2), nn.GELU(),
        )
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.proj = nn.Linear(256, self.EMBEDDING_DIM)
        self.norm = nn.LayerNorm(self.EMBEDDING_DIM)

    def forward(self, mel: torch.Tensor) -> torch.Tensor:
        # mel: [B, 1, 128, 128] → [B, 64]
        x = self.pool(self.convs(mel)).squeeze(-1).squeeze(-1)
        return self.norm(self.proj(x))
