#!/usr/bin/env python3
"""Run the Vodafone Red store locally."""

from app import app

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
