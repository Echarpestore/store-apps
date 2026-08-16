<?php
// Echarpe AI Photo Try-On — server-side only.
// Requires PHP cURL and OPENAI_API_KEY in the server environment
// OR api/config.php defining OPENAI_API_KEY.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function fail_json($msg, $status=400) {
  http_response_code($status);
  echo json_encode(['ok'=>false, 'error'=>$msg], JSON_UNESCAPED_UNICODE);
  exit;
}

if (file_exists(__DIR__ . '/config.php')) {
  require_once __DIR__ . '/config.php';
}
$key = getenv('OPENAI_API_KEY');
if (!$key && defined('OPENAI_API_KEY')) $key = OPENAI_API_KEY;
if (!$key) fail_json('OPENAI_API_KEY is not configured on the server', 500);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail_json('POST only', 405);
if (empty($_FILES['customer']) || $_FILES['customer']['error'] !== UPLOAD_ERR_OK)
  fail_json('Customer photo is required');

$max = 15 * 1024 * 1024;
if ($_FILES['customer']['size'] > $max) fail_json('Customer image is too large');

function safe_image_file($tmp, $name='image.jpg') {
  $info = @getimagesize($tmp);
  if (!$info || !in_array($info['mime'], ['image/jpeg','image/png','image/webp']))
    fail_json('Unsupported image format');
  return new CURLFile($tmp, $info['mime'], $name);
}

$customer = safe_image_file($_FILES['customer']['tmp_name'], $_FILES['customer']['name'] ?? 'customer.jpg');

$productTmp = null;
if (!empty($_FILES['product']) && $_FILES['product']['error'] === UPLOAD_ERR_OK) {
  if ($_FILES['product']['size'] > $max) fail_json('Product image is too large');
  $product = safe_image_file($_FILES['product']['tmp_name'], $_FILES['product']['name'] ?? 'product.jpg');
} elseif (!empty($_POST['product_url'])) {
  $url = trim($_POST['product_url']);
  if (!preg_match('#^https://#i', $url)) fail_json('Product URL must use HTTPS');

  // Download server-side when browser CORS prevents fetching the chat image.
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER=>true, CURLOPT_FOLLOWLOCATION=>true,
    CURLOPT_MAXREDIRS=>3, CURLOPT_TIMEOUT=>15,
    CURLOPT_USERAGENT=>'EcharpeTryOn/1.0'
  ]);
  $bytes = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $ctype = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
  curl_close($ch);
  if (!$bytes || $code < 200 || $code >= 300 || strlen($bytes) > $max)
    fail_json('Could not load product image');

  $productTmp = tempnam(sys_get_temp_dir(), 'ech_prod_');
  file_put_contents($productTmp, $bytes);
  $product = safe_image_file($productTmp, 'product.jpg');
} else {
  fail_json('Product photo is required');
}

$prompt = <<<'PROMPT'
Create a photorealistic virtual hijab try-on.

INPUT IMAGE 1 is the customer and must remain the base photograph.
INPUT IMAGE 2 is the exact hijab product reference.

Edit ONLY the head covering/hair area and the natural scarf drape around the neck and shoulders so the customer is realistically wearing the exact product from image 2.

Preserve the customer's identity extremely faithfully: same face, facial proportions, eyes, eyebrows, nose, lips, skin texture and tone, expression, head angle, body, clothes, hands, background, camera perspective and lighting. Do not beautify, reshape, retouch, age, change gender presentation, or alter facial hair.

Preserve the product faithfully: same fabric color, weave, pattern, embroidery, border/trim, edge details and material character. Do not invent a different scarf.

The hijab must cover the hair naturally, frame the face cleanly, wrap around the neck, and drape over the shoulders with believable fabric folds, shadows and occlusion. It must look physically worn, not pasted on.

Return one realistic finished photograph. No text, no collage, no split screen, no mannequin.
PROMPT;

$post = [
  'model' => 'gpt-image-2',
  'image[0]' => $customer,
  'image[1]' => $product,
  'prompt' => $prompt,
  'quality' => ($_POST['quality'] ?? 'medium'),
  'size' => '1024x1536',
  'output_format' => 'jpeg',
  'output_compression' => '88'
];

$ch = curl_init('https://api.openai.com/v1/images/edits');
curl_setopt_array($ch, [
  CURLOPT_POST=>true,
  CURLOPT_POSTFIELDS=>$post,
  CURLOPT_RETURNTRANSFER=>true,
  CURLOPT_TIMEOUT=>120,
  CURLOPT_HTTPHEADER=>[
    'Authorization: Bearer '.$key
  ]
]);
$raw = curl_exec($ch);
$http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);
if ($productTmp && file_exists($productTmp)) @unlink($productTmp);

if (!$raw) fail_json('AI connection failed: '.$curlErr, 502);
$data = json_decode($raw, true);
if ($http < 200 || $http >= 300) {
  $msg = $data['error']['message'] ?? 'Image generation failed';
  fail_json($msg, $http >= 500 ? 502 : 400);
}
$b64 = $data['data'][0]['b64_json'] ?? null;
if (!$b64) fail_json('No image returned by AI', 502);

echo json_encode([
  'ok'=>true,
  'image'=>$b64,
  'mime'=>'image/jpeg'
], JSON_UNESCAPED_UNICODE);
