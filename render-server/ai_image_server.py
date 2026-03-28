#!/usr/bin/env python3
"""
AI Image Generation Server for Canopy Video Engine
Keeps SDXL Turbo model loaded in memory for fast generation.
Runs as HTTP server on port 3001, called by the Node.js render server.

Endpoints:
  POST /generate  { "prompt": "...", "output": "/tmp/image.png" }
  GET  /health
"""

import json
import time
import torch
from http.server import HTTPServer, BaseHTTPRequestHandler
from diffusers import AutoPipelineForText2Image

# Load model ONCE at startup
print("Loading SDXL Turbo model into memory...")
start = time.time()
device = "mps" if torch.backends.mps.is_available() else "cpu"
pipe = AutoPipelineForText2Image.from_pretrained(
    "stabilityai/sdxl-turbo",
    torch_dtype=torch.float16,
    variant="fp16",
).to(device)
print(f"Model loaded in {time.time() - start:.1f}s on {device}. Ready for requests.")


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "model": "sdxl-turbo", "device": device}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == '/generate':
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length)) if length else {}

            prompt = body.get('prompt', 'tree service professional')
            output = body.get('output', '/tmp/ai_image.png')
            width = body.get('width', 768)
            height = body.get('height', 1344)

            try:
                gen_start = time.time()
                result = pipe(
                    prompt=prompt,
                    num_inference_steps=4,
                    guidance_scale=0.0,
                    width=width,
                    height=height,
                )
                image = result.images[0]
                image.save(output)
                gen_time = time.time() - gen_start

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "ok",
                    "output": output,
                    "time": round(gen_time, 1),
                    "size": f"{width}x{height}",
                }).encode())
                print(f"Generated image in {gen_time:.1f}s: {prompt[:60]}...")
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
                print(f"Generation failed: {e}")
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Suppress default logging
        pass


if __name__ == "__main__":
    port = 3001
    server = HTTPServer(('0.0.0.0', port), Handler)
    print(f"AI Image Server running on port {port}")
    server.serve_forever()
