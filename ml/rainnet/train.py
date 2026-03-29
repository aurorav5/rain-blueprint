"""RainNet v2 training loop scaffold. Requires GPU for practical use."""
import argparse
from pathlib import Path
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, random_split
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from ml.rainnet.model import RainNetV2
from ml.rainnet.dataset import RainNetDataset


def train(
    manifest_path: str,
    output_dir: str = "models/checkpoints",
    epochs: int = 50,
    batch_size: int = 32,
    lr: float = 1e-4,
    weight_decay: float = 1e-2,
    device: str = "cuda",
) -> None:
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    dataset = RainNetDataset(manifest_path)
    val_size = max(1, len(dataset) // 10)
    train_ds, val_ds = random_split(dataset, [len(dataset) - val_size, val_size])

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=4)
    val_loader   = DataLoader(val_ds,   batch_size=batch_size, shuffle=False, num_workers=2)

    model = RainNetV2().to(device)
    optimizer = AdamW(model.parameters(), lr=lr, weight_decay=weight_decay)
    scheduler = CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = nn.MSELoss()

    for epoch in range(1, epochs + 1):
        model.train()
        total_loss = 0.0
        for batch in train_loader:
            mel       = batch["mel"].to(device)
            artist    = batch["artist_vec"].to(device)
            genre_id  = batch["genre_id"].to(device)
            plat_id   = batch["platform_id"].to(device)
            mode      = batch["simple_mode"].to(device)
            targets   = batch["target_params"].to(device)

            optimizer.zero_grad()
            preds = model(mel, artist, genre_id, plat_id, mode)
            loss = criterion(preds, targets)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()

        scheduler.step()

        # Validation
        model.eval()
        val_mae = 0.0
        with torch.no_grad():
            for batch in val_loader:
                preds = model(
                    batch["mel"].to(device), batch["artist_vec"].to(device),
                    batch["genre_id"].to(device), batch["platform_id"].to(device),
                    batch["simple_mode"].to(device),
                )
                val_mae += (preds - batch["target_params"].to(device)).abs().mean().item()

        print(f"Epoch {epoch}/{epochs}  train_loss={total_loss/len(train_loader):.4f}  val_mae={val_mae/len(val_loader):.4f}")

        # Checkpoint
        ckpt = {
            "epoch": epoch,
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
        }
        torch.save(ckpt, f"{output_dir}/rainnet_v2_epoch_{epoch}.pt")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest")
    parser.add_argument("--output-dir", default="models/checkpoints")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--device", default="cuda")
    args = parser.parse_args()
    train(args.manifest, args.output_dir, args.epochs, args.batch_size, device=args.device)
