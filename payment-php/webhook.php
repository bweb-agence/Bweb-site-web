<?php
// Webhook Money Fusion (notification serveur-à-serveur).
// On extrait le jeton et on le transmet au site (Vercel) qui confirme la
// réservation + envoie l'e-mail (en réutilisant Supabase/Bird existants).
// Le site re-vérifie le paiement auprès de Money Fusion avant de confirmer.
require __DIR__ . '/config.php';

$raw  = file_get_contents('php://input');
error_log('[webhook] ' . $raw);
$body = json_decode($raw, true) ?: [];

// Le jeton peut apparaître sous plusieurs noms selon la charge utile.
$token = $body['tokenPay']
    ?? $body['token']
    ?? ($body['data']['tokenPay'] ?? null)
    ?? ($body['data']['token'] ?? null);

if ($token && defined('CONFIRM_URL') && CONFIRM_URL) {
    $ch = curl_init(CONFIRM_URL);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS     => json_encode(['token' => $token]),
        CURLOPT_TIMEOUT        => 30,
    ]);
    curl_exec($ch);
    curl_close($ch);
}

// On répond 200 rapidement pour éviter les renvois de Money Fusion.
http_response_code(200);
header('Content-Type: application/json');
echo json_encode(['ok' => true]);
