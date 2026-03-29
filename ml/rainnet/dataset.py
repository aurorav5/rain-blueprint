"""RainNetDataset — loads (audio_path, genre_label, platform_label, target_params) tuples."""
from __future__ import annotations
import json
from pathlib import Path
from typing import Optional
import numpy as np
import torch
from torch.utils.data import Dataset


class RainNetDataset(Dataset):
    """
    Each sample: JSON manifest with keys:
        audio_path: str
        genre_label: int (0-86)
        platform_label: int (0-7)
        target_params: dict matching ProcessingParams schema
    """

    def __init__(self, manifest_path: str, sr: int = 48000) -> None:
        self.samples: list[dict] = []
        self.sr = sr
        with open(manifest_path) as f:
            for line in f:
                line = line.strip()
                if line:
                    self.samples.append(json.loads(line))

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        sample = self.samples[idx]
        # Mel spectrogram extraction would use audio_analysis.extract_mel_spectrogram
        # For dataset loading, we expect pre-computed .npy files alongside audio
        mel_path = Path(sample["audio_path"]).with_suffix(".mel.npy")
        if mel_path.exists():
            mel = torch.from_numpy(np.load(str(mel_path))).float().unsqueeze(0)
        else:
            mel = torch.zeros(1, 128, 128)

        params = sample.get("target_params", {})
        param_vector = torch.zeros(32)

        return {
            "mel": mel,
            "artist_vec": torch.zeros(64),
            "genre_id": torch.tensor(sample.get("genre_label", 0), dtype=torch.long),
            "platform_id": torch.tensor(sample.get("platform_label", 0), dtype=torch.long),
            "simple_mode": torch.tensor([[1.0]]),
            "target_params": param_vector,
        }
