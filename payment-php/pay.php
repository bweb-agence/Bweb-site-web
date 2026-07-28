<?php
// Créer un paiement → renvoie l'URL Money Fusion vers laquelle rediriger l'acheteur.
// Body JSON attendu : { montant, nom, telephone, article?, meta? }
require __DIR__ . '/config.php';
bweb_cors();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    bweb_json(405, ['ok' => false, 'error' => 'methode']);
}

$in = json_decode(file_get_contents('php://input'), true) ?: [];
$montant    = isset($in['montant']) ? (float) $in['montant'] : 0;
$nom        = trim($in['nom'] ?? '');
$telephone  = trim($in['telephone'] ?? '');
$article    = trim($in['article'] ?? '') ?: 'Formation Bweb';
$meta       = (isset($in['meta']) && is_array($in['meta'])) ? $in['meta'] : new stdClass();

if ($montant <= 0 || $nom === '' || $telephone === '') {
    bweb_json(400, ['ok' => false, 'error' => 'champs_manquants']);
}

// Format Money Fusion (FusionPay)
$payload = [
    'totalPrice'    => $montant,
    'article'       => [[$article => $montant]],
    'personal_Info' => [$meta],
    'numeroSend'    => $telephone,
    'nomclient'     => $nom,
    'return_url'    => RETURN_URL,
    'webhook_url'   => rtrim(PUBLIC_BASE_URL, '/') . '/webhook.php',
];

$ch = curl_init(MONEYFUSION_API_URL);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
    CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
    CURLOPT_TIMEOUT        => 30,
]);
$resp = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err  = curl_error($ch);
curl_close($ch);

if ($resp === false) {
    error_log('[pay] curl: ' . $err);
    bweb_json(502, ['ok' => false, 'error' => 'reseau']);
}

$data = json_decode($resp, true) ?: [];
$url   = $data['url']   ?? ($data['data']['url']   ?? null);
$token = $data['token'] ?? ($data['data']['token'] ?? null);

if ($code >= 400 || !$url) {
    error_log('[pay] réponse inattendue ' . $code . ' ' . $resp);
    bweb_json(502, ['ok' => false, 'error' => 'moneyfusion_ko', 'details' => $data]);
}

bweb_json(200, ['ok' => true, 'url' => $url, 'token' => $token]);
