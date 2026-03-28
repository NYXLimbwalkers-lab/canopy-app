#!/usr/bin/env python3
"""
AI Image Generator for Canopy Video Engine
Uses SDXL Turbo via MLX on Apple Silicon for fast image generation.
Generates 9:16 portrait images for tree service video scenes.

Usage: python3 generate_image.py "prompt text" output.png
"""

import sys
import time
import torch
from diffusers import AutoPipelineForText2Image

# Use MPS (Metal Performance Shaders) on Apple Silicon
device = "mps" if torch.backends.mps.is_available() else "cpu"

def generate(prompt: str, output_path: str, width=768, height=1344):
    """Generate a single image from a text prompt."""
    start = time.time()
    print(f"Loading SDXL Turbo model...")

    pipe = AutoPipelineForText2Image.from_pretrained(
        "stabilityai/sdxl-turbo",
        torch_dtype=torch.float16,
        variant="fp16",
    ).to(device)

    print(f"Model loaded in {time.time() - start:.1f}s. Generating image...")
    gen_start = time.time()

    # SDXL Turbo needs only 1-4 steps (it's distilled)
    result = pipe(
        prompt=prompt,
        num_inference_steps=4,
        guidance_scale=0.0,  # Turbo doesn't need guidance
        width=width,
        height=height,
    )

    image = result.images[0]
    image.save(output_path)

    gen_time = time.time() - gen_start
    total_time = time.time() - start
    print(f"Image generated in {gen_time:.1f}s (total with model load: {total_time:.1f}s)")
    print(f"Saved to: {output_path}")
    return output_path

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 generate_image.py 'prompt' output.png")
        sys.exit(1)
    generate(sys.argv[1], sys.argv[2])
