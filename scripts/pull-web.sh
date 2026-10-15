#!/bin/bash
# Holt den aktuellen Stand des Web-Spiels (~/Projects/redline/public) in den Repo-Ordner web/ (ohne Test-/Admin-Seiten).
set -e; cd "$(dirname "$0")/.."
rsync -a --delete --exclude '_*.html' --exclude 'admin.html' --exclude 'sw.js' --exclude 'robots.txt' ~/Projects/redline/public/ web/
echo "web/ aktualisiert: $(du -sh web | cut -f1)"
