#!/usr/bin/env python3
"""Generate app icons and splash screens for PTA (Precious Tots Academy)"""
from PIL import Image, ImageDraw, ImageFont
import os

GREEN = (56, 142, 60)    # #388E3C
GOLD = (212, 175, 55)    # #D4AF37
WHITE = (255, 255, 255)
MASTER_ICON = os.path.join(os.path.dirname(__file__), 'icon-master.png')

def make_icon(size, path, maskable=False):
    img = Image.open(MASTER_ICON).convert('RGB')
    img = img.resize((size, size), Image.Resampling.LANCZOS)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'PNG')
    print(f"  Generated: {path} ({size}x{size})")

def make_splash(width, height, path):
    img = Image.new('RGBA', (width, height), GREEN)
    draw = ImageDraw.Draw(img)
    
    # Draw a white rounded square with PT in center
    icon_size = min(width, height) // 3
    ix = (width - icon_size) // 2
    iy = (height - icon_size) // 2
    radius = int(icon_size * 0.22)
    draw.rounded_rectangle([ix, iy, ix + icon_size, iy + icon_size], radius=radius, fill=WHITE)
    
    font_size = int(icon_size * 0.55)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except:
        font = ImageFont.load_default()
    
    text = "PT"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = ix + (icon_size - tw) // 2 - bbox[0]
    ty = iy + (icon_size - th) // 2 - bbox[1] - int(icon_size * 0.03)
    draw.text((tx, ty), text, fill=GREEN, font=font)
    
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'PNG')
    print(f"  Generated: {path} ({width}x{height})")

print("Generating Android icons...")
android_icon_sizes = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}
for folder, size in android_icon_sizes.items():
    make_icon(size, f'android/app/src/main/res/{folder}/ic_launcher.png')
    make_icon(size, f'android/app/src/main/res/{folder}/ic_launcher_round.png')
    make_icon(size, f'android/app/src/main/res/{folder}/ic_launcher_foreground.png')

print("\nGenerating Android splash...")
make_splash(470, 320, 'android/app/src/main/res/drawable-land-hdpi/splash.png')
os.makedirs('android/app/src/main/res/drawable-land-mdpi', exist_ok=True)
make_splash(320, 240, 'android/app/src/main/res/drawable-land-mdpi/splash.png')
os.makedirs('android/app/src/main/res/drawable-land-xhdpi', exist_ok=True)
make_splash(640, 480, 'android/app/src/main/res/drawable-land-xhdpi/splash.png')
os.makedirs('android/app/src/main/res/drawable-land-xxhdpi', exist_ok=True)
make_splash(960, 720, 'android/app/src/main/res/drawable-land-xxhdpi/splash.png')
os.makedirs('android/app/src/main/res/drawable-land-xxxhdpi', exist_ok=True)
make_splash(1280, 960, 'android/app/src/main/res/drawable-land-xxxhdpi/splash.png')

print("\nGenerating iOS icons...")
ios_icon_sizes = [
    (1024, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-1024.png'),
    (180, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-180.png'),
    (167, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-167.png'),
    (152, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-152.png'),
    (120, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-120.png'),
    (87, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-87.png'),
    (80, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-80.png'),
    (76, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-76.png'),
    (60, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-60.png'),
    (40, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-40.png'),
    (29, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-29.png'),
    (20, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-20.png'),
]
for size, path in ios_icon_sizes:
    make_icon(size, path)

print("\nGenerating iOS splash...")
ios_splash_sizes = [
    (2732, 2732, 'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732.png'),
    (2436, 1125, 'ios/App/App/Assets.xcassets/Splash.imageset/splash-2436-1125.png'),
    (2208, 1242, 'ios/App/App/Assets.xcassets/Splash.imageset/splash-2208-1242.png'),
    (1668, 2224, 'ios/App/App/Assets.xcassets/Splash.imageset/splash-1668-2224.png'),
    (1536, 2048, 'ios/App/App/Assets.xcassets/Splash.imageset/splash-1536-2048.png'),
    (1242, 2208, 'ios/App/App/Assets.xcassets/Splash.imageset/splash-1242-2208.png'),
    (1125, 2436, 'ios/App/App/Assets.xcassets/Splash.imageset/splash-1125-2436.png'),
    (750, 1334, 'ios/App/App/Assets.xcassets/Splash.imageset/splash-750-1334.png'),
    (640, 1136, 'ios/App/App/Assets.xcassets/Splash.imageset/splash-640-1136.png'),
]
for w, h, path in ios_splash_sizes:
    make_splash(w, h, path)

print("\n✅ All icons and splash screens generated!")
