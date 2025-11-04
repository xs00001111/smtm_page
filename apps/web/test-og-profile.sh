#!/bin/bash

# Test OG profile image generation endpoint
# Usage: ./test-og-profile.sh [base_url]

BASE_URL="${1:-http://localhost:3000}"

# Test parameters based on the error logs
ADDRESS="0x878ca7bc010e57F22586198887DEeb8027969340"
USERNAME="@ThoughtCrime"
PNL="592.5"
INVESTED="176.8"
VALUE="769.3"
ROI="+335.21%"

URL="${BASE_URL}/api/og/profile?address=${ADDRESS}&username=${USERNAME}&pnl=${PNL}&invested=${INVESTED}&value=${VALUE}&roi=${ROI}"

echo "Testing OG Profile endpoint..."
echo "URL: $URL"
echo ""

# Make the request and save the response
curl -v -o /tmp/og-profile-test.png "$URL" 2>&1 | tee /tmp/og-profile-curl.log

# Check the response
if [ -f /tmp/og-profile-test.png ]; then
    FILE_SIZE=$(stat -f%z /tmp/og-profile-test.png 2>/dev/null || stat -c%s /tmp/og-profile-test.png 2>/dev/null)
    echo ""
    echo "Response saved to /tmp/og-profile-test.png"
    echo "File size: $FILE_SIZE bytes"

    if [ $FILE_SIZE -gt 1000 ]; then
        echo "✅ Success! Image generated successfully"
        file /tmp/og-profile-test.png
        echo "You can open the file to view: open /tmp/og-profile-test.png"
    else
        echo "❌ Failed! File too small, likely an error response"
        echo "Response content:"
        cat /tmp/og-profile-test.png
    fi
else
    echo "❌ Failed! No response file created"
fi
