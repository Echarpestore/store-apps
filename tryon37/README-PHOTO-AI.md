# v51 — AI Photo Try-On

This build makes **AI Photo Try-On** the main photo experience while keeping Live as beta.

## One-time server setup
1. Upload the folder to your HTTPS try-on path.
2. Copy `api/config.example.php` to `api/config.php`.
3. Put your OpenAI API key in `api/config.php`.
4. Make sure PHP cURL is enabled.

The API key stays server-side and is never sent to the browser.

## Product photo
The existing chat integration can keep passing the product image using `?img=...`
or the existing session source. If no product image was passed, the UI asks for
one manually.

## Flow
Customer taps `✨ جرّبي بالـAI` → chooses/takes her photo → the existing product
image is included automatically → `/api/photo-tryon.php` sends both reference
images to GPT Image → the finished try-on appears in the same try-on screen.

The AI endpoint uses `gpt-image-2` with the customer photo first and product photo
second, and asks to preserve identity/background/clothes while editing only the hijab.
