#!/usr/bin/env bash
# Download the spaCy English pipeline for the Project Context Translator.
# Run once after installing requirements:
#   pip install -r requirements.txt
#   bash setup_spacy.sh
set -e
python -m spacy download en_core_web_sm
echo "spaCy model en_core_web_sm installed successfully."
