import random
import argparse
import sys

def zalgo_text(text: str, intensity: int = 4) -> str:
    combining = [chr(i) for i in range(0x0300, 0x036F)]
    result = []
    for char in text:
        result.append(char)
        for _ in range(random.randint(1, intensity)):
            result.append(random.choice(combining))
    return ''.join(result)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Add slight Zalgo glitch to text")
    parser.add_argument("text", nargs="?", default="sample text",
                        help="Text to Zalgo-ify")
    parser.add_argument("-i", "--intensity", type=int, default=3, help="Zalgo intensity (1-8, default 3 for slight)")
    parser.add_argument("--html", action="store_true", help="Output wrapped in simple HTML")
    
    try:
        args = parser.parse_args()
    except SystemExit:
        sys.exit(0)  # clean exit if user uses --help
    
    result = zalgo_text(args.text, args.intensity)
    
    if args.html:
        print(f'<div style="font-size: 2em; line-height: 1.4;">{result}</div>')
    else:
        print(result)