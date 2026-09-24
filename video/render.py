#!/usr/bin/env python3
"""Render the narrated architecture overview with Pillow, macOS say and FFmpeg."""

import argparse
import hashlib
import json
import math
import shutil
import subprocess
import wave
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT, FPS, SAMPLE_RATE = 1280, 720, 24, 48000
BACKGROUND = "#0d1915"
PANEL = "#15271f"
LINE = "#345344"
TEXT = "#f2f6e9"
MUTED = "#a6baad"
MINT = "#d5ed7c"
BASE = Path(__file__).resolve().parent
STEM = "earnonsol-technical-overview"


def run(arguments):
    subprocess.run(arguments, check=True, stdout=subprocess.DEVNULL)


@lru_cache(maxsize=128)
def font(size, bold=False, mono=False):
    candidates = (
        ["/System/Library/Fonts/Menlo.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"]
        if mono else
        [f"/System/Library/Fonts/Supplemental/Arial{' Bold' if bold else ''}.ttf",
         f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'-Bold' if bold else ''}.ttf"]
    )
    for candidate in candidates:
        if Path(candidate).is_file():
            return ImageFont.truetype(candidate, size)
    raise RuntimeError("Install Arial or DejaVu Sans before rendering.")


def wrapped(draw, text, selected_font, width):
    lines = []
    for paragraph in text.split("\n"):
        line = ""
        for word in paragraph.split():
            candidate = f"{line} {word}".strip()
            if line and draw.textlength(candidate, font=selected_font) > width:
                lines.append(line)
                line = word
            else:
                line = candidate
        lines.append(line)
    return lines


def text_block(draw, xy, text, size=24, color=TEXT, width=1100, bold=False, max_lines=2):
    selected_font = font(size, bold)
    lines = wrapped(draw, text, selected_font, width)
    if len(lines) > max_lines:
        raise ValueError(f"Text exceeds its layout: {text}")
    for index, line in enumerate(lines):
        if draw.textlength(line, font=selected_font) > width:
            raise ValueError(f"Text is too wide: {line}")
        draw.text((xy[0], xy[1] + index * (size + 9)), line, font=selected_font, fill=color)


def arrow(draw, start, end, time):
    draw.line([start, end], fill=LINE, width=2)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    points = [end]
    for offset in [-0.5, 0.5]:
        points.append((end[0] - 9 * math.cos(angle + offset), end[1] - 9 * math.sin(angle + offset)))
    draw.polygon(points, fill=MUTED)
    phase = (time * 0.38) % 1
    x = start[0] + (end[0] - start[0]) * phase
    y = start[1] + (end[1] - start[1]) * phase
    draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=MINT)


def card(draw, x, y, width, number, title, detail, active=False, height=178):
    draw.rounded_rectangle((x, y, x + width, y + height), 16, fill="#213b2b" if active else PANEL,
                           outline=MINT if active else LINE, width=2 if active else 1)
    draw.text((x + 24, y + 20), number, font=font(13, mono=True), fill=MINT if active else MUTED)
    text_block(draw, (x + 24, y + 54), title, size=26, width=width - 48, bold=True)
    text_block(draw, (x + 24, y + 112), detail, size=18, color=MUTED, width=width - 48)


def three_cards(draw, cards, time, duration):
    active = min(2, int(time / duration * 3))
    for index, (number, title, detail) in enumerate(cards):
        card(draw, 64 + index * 396, 275, 360, number, title, detail, active == index)
        if index < 2:
            arrow(draw, (432 + index * 396, 364), (452 + index * 396, 364), time)


def band(draw, label, detail, y=493):
    draw.rounded_rectangle((64, y, 1216, y + 74), 12, fill=PANEL)
    draw.text((86, y + 14), label, font=font(12, bold=True), fill=MINT)
    text_block(draw, (86, y + 35), detail, size=20, width=1110, max_lines=1)


def base_image():
    image = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(image)
    for x in range(24, WIDTH, 40):
        for y in range(20, 600, 40):
            draw.point((x, y), fill="#233229")
    draw.text((64, 35), "EARN", font=font(28, bold=True), fill=TEXT)
    draw.text((155, 43), "/ ON SOLANA", font=font(12, mono=True), fill=MUTED)
    draw.text((962, 42), "ENGINEERING / 2026.09", font=font(13, mono=True), fill=MUTED)
    draw.line((64, 83, 1216, 83), fill=LINE)
    return image


BACKGROUND_IMAGE = None


def frame(story, scene_index, local_time, absolute_time, caption=""):
    image = BACKGROUND_IMAGE.copy()
    draw = ImageDraw.Draw(image)
    scene = story["scenes"][scene_index]
    draw.text((64, 115), scene["eyebrow"], font=font(13, mono=True), fill=MINT)
    title_size = 46
    while draw.textlength(scene["title"], font=font(title_size, True)) > 1152:
        title_size -= 1
    draw.text((64, 151), scene["title"], font=font(title_size, True), fill=TEXT)
    time = local_time
    scene_id = scene["id"]

    if scene_id == "overview":
        draw.text((64, 219), "BROWSER  /  EDGE SERVICES  /  ON-CHAIN EXECUTION", font=font(14, mono=True), fill=MUTED)
        three_cards(draw, [
            ("01 / EXPERIENCE", "Homepage + Vault App", "User wallet signs transactions"),
            ("02 / COORDINATION", "Cloudflare", "Worker + Durable Objects"),
            ("03 / EXECUTION", "Solana", "EARN vaults + Raydium CLMM"),
        ], time, scene["duration"])
        band(draw, "SYSTEM MAP", "Current deployed architecture  •  Reviewed September 24, 2026")
    elif scene_id == "edge":
        draw.text((64, 219), "THE WALLET APPROVES. THE GATEWAY VALIDATES.", font=font(14, mono=True), fill=MUTED)
        three_cards(draw, [
            ("BROWSER", "React + TypeScript", "Homepage / App / wallet"),
            ("CLOUDFLARE WORKER", "Static hosting + API", "RPC gateway and public reads"),
            ("SERVER TRANSPORT", "Solana RPC", "Network-validated requests"),
        ], time, scene["duration"])
        band(draw, "SUPPORTING SERVICES", "Display market statistics  /  Keeper status  /  Devnet test-token faucet")
    elif scene_id == "transactions":
        draw.text((64, 219), "CONVERSION + DEPOSIT EXECUTE ATOMICALLY", font=font(14, mono=True), fill=MINT)
        three_cards(draw, [
            ("01 / USER INPUT", "USDC", "Wallet approves and signs"),
            ("02 / ATOMIC TRANSACTION", "Convert + deposit", "Selected asset pair enters vault"),
            ("03 / ON-CHAIN POSITION", "Vault shares", "Raydium CLMM liquidity"),
        ], time, scene["duration"])
        band(draw, "REDEMPTION", "Burn vault shares  →  Receive the underlying asset + USDC")
    elif scene_id == "keeper":
        draw.text((64, 219), "ONE DURABLE JOURNAL PER NETWORK, PROGRAM AND VAULT", font=font(14, mono=True), fill=MUTED)
        three_cards(draw, [
            ("STRATEGY DECISION", "Every 24 hours", "UTC 00 cycle + vault offsets"),
            ("EXECUTION", "Submit once", "Persist signed bytes first"),
            ("PENDING SIGNATURE", "Every 45 seconds", "Confirmation checks only"),
        ], time, scene["duration"])
        band(draw, "ELIGIBILITY AND RECOVERY", "Fee-only reinvestment: ≥ 10 USDC  /  Failure or expiry: next daily decision")
    elif scene_id == "transport":
        draw.text((64, 219), "READ FAILOVER DOES NOT REBROADCAST A KEEPER TRANSACTION", font=font(14, mono=True), fill=MUTED)
        three_cards(draw, [
            ("PRIMARY", "Helius", "Preferred RPC provider"),
            ("STANDBY", "Backup Helius", "Independent configured endpoint"),
            ("FALLBACK", "Public Solana RPC", "Matching network only"),
        ], time, scene["duration"])
        band(draw, "DATA BOUNDARY", "Market cache: display only  /  Accounting + execution: chain state  /  No idle App polling")
    elif scene_id == "controls":
        for index, name in enumerate(["MAINNET", "DEVNET"]):
            x = 64 + index * 592
            draw.rounded_rectangle((x, 240, x + 560, 408), 16, fill=PANEL, outline=LINE)
            draw.text((x + 24, 260), name, font=font(14, mono=True), fill=MINT)
            draw.text((x + 24, 297), "6 live vaults", font=font(37, True), fill=TEXT)
            draw.text((x + 24, 360), "Shared logic / separate identities + policies", font=font(19), fill=MUTED)
        for index, role in enumerate(["REGISTRAR", "VAULT AUTHORITY", "KEEPER", "UPGRADE AUTHORITY"]):
            x = 64 + index * 292
            draw.rounded_rectangle((x, 434, x + 276, 481), 10, fill="#213b2b", outline=LINE)
            draw.text((x + 138, 457), role, font=font(13, mono=True), fill=MINT, anchor="mm")
        band(draw, "INDEPENDENT CONTROLS", "Pause deposits / withdrawals / strategy  •  Compatible upgrades preserve identities", y=500)
    elif scene_id == "source":
        draw.text((64, 219), "THIS REPOSITORY CONTAINS FRESH, INDEPENDENT EXAMPLES", font=font(14, mono=True), fill=MUTED)
        card(draw, 64, 275, 560, "WEBSITE SOURCE", "website/", "Original HTML + CSS landing page", True)
        card(draw, 656, 275, 560, "CONTRACT SOURCE", "contract/", "Native Rust counter / 10 host tests", True)
        band(draw, "EXPLORE THE CODE AND SYSTEM MAP", "github.com/swift-pixel66/earnonsol")

    # A persistent chapter rail makes the two-minute structure easy to follow.
    rail_x = 64
    for index, item in enumerate(story["scenes"]):
        rail_width = item["duration"] / story["durationSeconds"] * 1116
        draw.rounded_rectangle((rail_x, 596, rail_x + rail_width, 599), 1, fill=LINE)
        fraction = 1 if index < scene_index else min(1, time / item["duration"]) if index == scene_index else 0
        if fraction > 0:
            draw.rectangle((rail_x, 596, rail_x + rail_width * fraction, 599), fill=MINT)
        rail_x += rail_width + 6

    if caption:
        draw.rounded_rectangle((54, 620, 1226, 704), 12, fill="#07100c")
        lines = wrapped(draw, caption, font(25), 1112)
        if len(lines) > 2:
            raise ValueError(f"Subtitle exceeds two lines: {caption}")
        start_y = 645 if len(lines) == 1 else 629
        for index, line in enumerate(lines):
            draw.text((640, start_y + index * 33), line, font=font(25), fill=TEXT, anchor="mt")

    fade = min(1.0, max(0.0, time / 0.32), max(0.0, (scene["duration"] - time) / 0.32))
    return Image.blend(BACKGROUND_IMAGE, image, fade)


def duration(path):
    output = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)
    ], text=True)
    return float(json.loads(output)["format"]["duration"])


def spoken(text):
    for original, replacement in [("EARN", "Earn"), ("USDC", "U S D C"), ("RPC", "R P C"),
                                  ("CLMM", "C L M M"), ("UTC", "U T C"), ("Raydium", "Ray dee um")]:
        text = text.replace(original, replacement)
    return text


def timecode(seconds):
    milliseconds = round(seconds * 1000)
    hours, remainder = divmod(milliseconds, 3600000)
    minutes, remainder = divmod(remainder, 60000)
    seconds, milliseconds = divmod(remainder, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"


def narration(story, work, output):
    cues = []
    pieces = []
    global_start = 0
    for scene in story["scenes"]:
        raw = []
        for sentence in scene["sentences"]:
            speech = spoken(sentence)
            digest = hashlib.sha256((story["voice"] + "|165|" + speech).encode()).hexdigest()[:18]
            audio = work / f"speech-{digest}.aiff"
            if not audio.exists():
                source = work / f"speech-{digest}.txt"
                source.write_text(speech)
                run(["say", "-v", story["voice"], "-r", "165", "-f", str(source), "-o", str(audio)])
            raw.append((audio, duration(audio), sentence))
        lead, gap, tail = 0.45, 0.12, 0.35
        available = scene["duration"] - lead - tail - gap * (len(raw) - 1)
        tempo = sum(item[1] for item in raw) / available
        if not 0.7 <= tempo <= 1.4:
            raise ValueError(f"Rewrite chapter {scene['id']}: narration tempo would be {tempo:.2f}.")
        scene_bytes = bytearray(round(lead * SAMPLE_RATE) * 2)
        for index, (audio, raw_seconds, sentence) in enumerate(raw):
            seconds = raw_seconds / tempo
            pcm = work / f"{scene['id']}-{index}.wav"
            run(["ffmpeg", "-v", "error", "-y", "-i", str(audio), "-af", f"atempo={tempo:.8f},apad",
                 "-t", f"{seconds:.8f}", "-ar", str(SAMPLE_RATE), "-ac", "1", "-c:a", "pcm_s16le", str(pcm)])
            with wave.open(str(pcm), "rb") as stream:
                content = stream.readframes(stream.getnframes())
            target_bytes = round(seconds * SAMPLE_RATE) * 2
            content = content[:target_bytes].ljust(target_bytes, b"\0")
            start = global_start + len(scene_bytes) / (SAMPLE_RATE * 2)
            cues.append({"start": start, "end": start + seconds, "text": sentence})
            scene_bytes.extend(content)
            if index + 1 < len(raw):
                scene_bytes.extend(bytes(round(gap * SAMPLE_RATE) * 2))
        target_bytes = round(scene["duration"] * SAMPLE_RATE) * 2
        pieces.append(bytes(scene_bytes[:target_bytes]).ljust(target_bytes, b"\0"))
        global_start += scene["duration"]
        print(f"Narration: {scene['id']} / {scene['duration']}s / tempo {tempo:.2f}", flush=True)
    wav = work / "narration.wav"
    with wave.open(str(wav), "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(SAMPLE_RATE)
        stream.writeframes(b"".join(pieces))
    subtitle = output / f"{STEM}.en.srt"
    subtitle.write_text("\n\n".join(
        f"{index + 1}\n{timecode(cue['start'])} --> {timecode(cue['end'])}\n{cue['text']}"
        for index, cue in enumerate(cues)
    ) + "\n")
    (work / "cue-timing.json").write_text(json.dumps(cues, indent=2) + "\n")
    return wav, cues


def previews(story, work):
    images = []
    elapsed = 0
    for index, scene in enumerate(story["scenes"]):
        image = frame(story, index, min(5, scene["duration"] / 2), elapsed + 5, scene["sentences"][0])
        image.save(work / f"preview-{scene['id']}.png")
        images.append(image.resize((640, 360), Image.Resampling.LANCZOS))
        elapsed += scene["duration"]
    sheet = Image.new("RGB", (1280, math.ceil(len(images) / 2) * 360), BACKGROUND)
    for index, image in enumerate(images):
        sheet.paste(image, ((index % 2) * 640, (index // 2) * 360))
    sheet.save(work / "contact-sheet.jpg", quality=92)


def render_video(story, work, output, wav, cues):
    destination = output / f"{STEM}.mp4"
    args = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{HEIGHT}",
            "-r", str(FPS), "-i", "pipe:0", "-i", str(wav),
            "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-preset", "medium",
            "-crf", "22", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-ar", str(SAMPLE_RATE),
            "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-metadata:s:a:0", "language=eng",
            "-metadata", f"title={story['title']}", "-movflags", "+faststart", "-t", str(story["durationSeconds"]), str(destination)]
    process = subprocess.Popen(args, stdin=subprocess.PIPE)
    elapsed = 0
    cue_index = 0
    try:
        for index, scene in enumerate(story["scenes"]):
            for number in range(round(scene["duration"] * FPS)):
                local = number / FPS
                time = elapsed + local
                while cue_index + 1 < len(cues) and time >= cues[cue_index]["end"]:
                    cue_index += 1
                cue = cues[cue_index]
                caption = cue["text"] if cue["start"] <= time < cue["end"] else ""
                process.stdin.write(frame(story, index, local, time, caption).tobytes())
            elapsed += scene["duration"]
            print(f"Video: {elapsed}/{story['durationSeconds']} seconds rendered", flush=True)
    finally:
        process.stdin.close()
    if process.wait() != 0:
        raise RuntimeError("FFmpeg could not finish the video.")
    frame(story, 0, 4, 4).save(output / "poster.png")
    report = {
        "durationSeconds": duration(destination), "width": WIDTH, "height": HEIGHT, "framesPerSecond": FPS,
        "language": "en", "narration": f"macOS {story['voice']} (synthetic)", "subtitleCues": len(cues),
        "architectureAsOf": story["architectureAsOf"], "bytes": destination.stat().st_size,
        "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
    }
    (output / "media-info.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2), flush=True)


def main():
    global BACKGROUND_IMAGE
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=BASE)
    parser.add_argument("--work-dir", type=Path, default=BASE / ".build")
    parser.add_argument("--stills-only", action="store_true")
    parser.add_argument("--audio-only", action="store_true")
    options = parser.parse_args()
    work, output = options.work_dir.resolve(), options.output_dir.resolve()
    work.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    story = json.loads((BASE / "storyboard.json").read_text())
    assert sum(scene["duration"] for scene in story["scenes"]) == story["durationSeconds"] == 120
    BACKGROUND_IMAGE = base_image()
    sample_draw = ImageDraw.Draw(BACKGROUND_IMAGE)
    for scene in story["scenes"]:
        for sentence in scene["sentences"]:
            assert len(wrapped(sample_draw, sentence, font(25), 1112)) <= 2, sentence
    previews(story, work)
    if options.stills_only:
        return
    for command in ["say", "ffmpeg", "ffprobe"]:
        if not shutil.which(command):
            raise RuntimeError(f"Install {command} before rendering narration and video.")
    wav, cues = narration(story, work, output)
    if not options.audio_only:
        render_video(story, work, output, wav, cues)


if __name__ == "__main__":
    main()
