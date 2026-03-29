"""SpectralRepairNet: U-Net for artifact removal in STFT domain."""
import torch
import torch.nn as nn


class SpectralRepairNet(nn.Module):
    def __init__(self, n_fft: int = 1024) -> None:
        super().__init__()
        ch = n_fft // 2 + 1

        self.enc1 = nn.Sequential(nn.Conv2d(2, 32, 3, padding=1), nn.GELU())
        self.enc2 = nn.Sequential(nn.Conv2d(32, 64, 3, padding=1, stride=2), nn.GELU())
        self.enc3 = nn.Sequential(nn.Conv2d(64, 128, 3, padding=1, stride=2), nn.GELU())
        self.bottleneck = nn.Sequential(nn.Conv2d(128, 128, 3, padding=1), nn.GELU())
        self.dec3 = nn.Sequential(nn.ConvTranspose2d(256, 64, 2, stride=2), nn.GELU())
        self.dec2 = nn.Sequential(nn.ConvTranspose2d(128, 32, 2, stride=2), nn.GELU())
        self.dec1 = nn.Conv2d(64, 2, 3, padding=1)  # output: mag + phase mask

    def forward(self, stft: torch.Tensor) -> torch.Tensor:
        # stft: [B, 2, freq, time] (real + imag)
        e1 = self.enc1(stft)
        e2 = self.enc2(e1)
        e3 = self.enc3(e2)
        b  = self.bottleneck(e3)
        d3 = self.dec3(torch.cat([b, e3], dim=1))
        d2 = self.dec2(torch.cat([d3, e2], dim=1))
        mask = torch.sigmoid(self.dec1(torch.cat([d2, e1], dim=1)))
        return stft * mask  # apply multiplicative mask
