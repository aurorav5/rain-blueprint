export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rain: {
          black:  "#0A0A0A",
          dark:   "#111111",
          panel:  "#1A1A1A",
          border: "#2A2A2A",
          muted:  "#3A3A3A",
          dim:    "#666666",
          silver: "#999999",
          white:  "#F0F0F0",
          blue:   "#4A9EFF",
          cyan:   "#00D4FF",
          amber:  "#FFB347",
          red:    "#FF4A4A",
          green:  "#4AFF8A",
        }
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "scan": "scan 2s linear infinite",
      },
      keyframes: {
        scan: {
          "0%":   { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        }
      }
    }
  }
}
