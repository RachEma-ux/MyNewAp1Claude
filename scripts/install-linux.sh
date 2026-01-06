#!/bin/bash

# Unified LLM Platform - Linux Installer
# Supports: Ubuntu, Debian, Fedora, CentOS, Arch

set -e

echo "========================================="
echo "Unified LLM Platform Installer"
echo "========================================="
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
  echo "Please do not run as root"
  exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
  VER=$VERSION_ID
else
  echo "Cannot detect OS"
  exit 1
fi

echo "Detected OS: $OS $VER"
echo ""

# Install dependencies
echo "Installing dependencies..."

case $OS in
  ubuntu|debian)
    sudo apt-get update
    sudo apt-get install -y curl wget git build-essential
    ;;
  fedora|centos|rhel)
    sudo dnf install -y curl wget git gcc gcc-c++ make
    ;;
  arch)
    sudo pacman -Sy --noconfirm curl wget git base-devel
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

# Install Node.js 22
echo ""
echo "Installing Node.js 22..."

if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  
  case $OS in
    ubuntu|debian)
      sudo apt-get install -y nodejs
      ;;
    fedora|centos|rhel)
      sudo dnf install -y nodejs
      ;;
    arch)
      sudo pacman -S --noconfirm nodejs npm
      ;;
  esac
else
  echo "Node.js already installed: $(node --version)"
fi

# Install pnpm
echo ""
echo "Installing pnpm..."

if ! command -v pnpm &> /dev/null; then
  npm install -g pnpm
else
  echo "pnpm already installed: $(pnpm --version)"
fi

# Create installation directory
INSTALL_DIR="$HOME/.unified-llm"
echo ""
echo "Installing to: $INSTALL_DIR"

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download latest release
echo ""
echo "Downloading latest release..."

LATEST_URL="https://github.com/unified-llm/platform/releases/latest/download/unified-llm-linux.tar.gz"
wget -O unified-llm.tar.gz "$LATEST_URL"

# Extract
echo "Extracting..."
tar -xzf unified-llm.tar.gz
rm unified-llm.tar.gz

# Install dependencies
echo ""
echo "Installing application dependencies..."
pnpm install --prod

# Create systemd service
echo ""
echo "Creating systemd service..."

SERVICE_FILE="$HOME/.config/systemd/user/unified-llm.service"
mkdir -p "$(dirname "$SERVICE_FILE")"

cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Unified LLM Platform
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) $INSTALL_DIR/dist/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF

# Enable and start service
systemctl --user daemon-reload
systemctl --user enable unified-llm
systemctl --user start unified-llm

# Create desktop entry
echo ""
echo "Creating desktop entry..."

DESKTOP_FILE="$HOME/.local/share/applications/unified-llm.desktop"
mkdir -p "$(dirname "$DESKTOP_FILE")"

cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Name=Unified LLM
Comment=Unified LLM Platform
Exec=xdg-open http://localhost:3000
Icon=$INSTALL_DIR/icon.png
Terminal=false
Type=Application
Categories=Development;
EOF

# Create CLI command
echo ""
echo "Creating CLI command..."

CLI_FILE="$HOME/.local/bin/unified-llm"
mkdir -p "$(dirname "$CLI_FILE")"

cat > "$CLI_FILE" << 'EOF'
#!/bin/bash

case "$1" in
  start)
    systemctl --user start unified-llm
    echo "Unified LLM started"
    ;;
  stop)
    systemctl --user stop unified-llm
    echo "Unified LLM stopped"
    ;;
  restart)
    systemctl --user restart unified-llm
    echo "Unified LLM restarted"
    ;;
  status)
    systemctl --user status unified-llm
    ;;
  logs)
    journalctl --user -u unified-llm -f
    ;;
  update)
    echo "Checking for updates..."
    # Update logic here
    ;;
  uninstall)
    systemctl --user stop unified-llm
    systemctl --user disable unified-llm
    rm -rf ~/.unified-llm
    rm -f ~/.config/systemd/user/unified-llm.service
    rm -f ~/.local/share/applications/unified-llm.desktop
    rm -f ~/.local/bin/unified-llm
    echo "Unified LLM uninstalled"
    ;;
  *)
    echo "Usage: unified-llm {start|stop|restart|status|logs|update|uninstall}"
    exit 1
    ;;
esac
EOF

chmod +x "$CLI_FILE"

# Add to PATH if needed
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
  echo ""
  echo "Added ~/.local/bin to PATH"
  echo "Run: source ~/.bashrc"
fi

echo ""
echo "========================================="
echo "Installation Complete!"
echo "========================================="
echo ""
echo "Unified LLM is now running at: http://localhost:3000"
echo ""
echo "Commands:"
echo "  unified-llm start    - Start the service"
echo "  unified-llm stop     - Stop the service"
echo "  unified-llm restart  - Restart the service"
echo "  unified-llm status   - Check service status"
echo "  unified-llm logs     - View logs"
echo "  unified-llm update   - Check for updates"
echo "  unified-llm uninstall - Uninstall"
echo ""
echo "Opening browser..."
sleep 2
xdg-open http://localhost:3000 2>/dev/null || echo "Please open http://localhost:3000 in your browser"
