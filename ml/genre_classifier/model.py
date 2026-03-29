"""Genre classifier: EfficientNet-B0 inspired, 87 classes, multi-label."""
import torch
import torch.nn as nn


class GenreClassifier(nn.Module):
    N_GENRES: int = 87

    def __init__(self) -> None:
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Conv2d(1, 32, 3, padding=1), nn.GELU(),
            nn.Conv2d(32, 64, 3, padding=1, stride=2), nn.GELU(),
            nn.Conv2d(64, 128, 3, padding=1, stride=2), nn.GELU(),
            nn.Conv2d(128, 256, 3, padding=1, stride=2), nn.GELU(),
            nn.AdaptiveAvgPool2d(1),
        )
        self.classifier = nn.Linear(256, self.N_GENRES)

    def forward(self, mel: torch.Tensor) -> torch.Tensor:
        # mel: [B, 1, 128, 128]
        x = self.encoder(mel).squeeze(-1).squeeze(-1)
        return torch.sigmoid(self.classifier(x))  # multi-label
