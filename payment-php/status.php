<?php
// Vérifier le statut d'une transaction (appelé par la page de retour du site).
// GET status.php?token=XXXX  →  { ok, statut, montant }
require __DIR__ . '/config.php';
bweb_cors();

$token = trim($_GET['token'] ?? '');
if ($token === '') {
    bweb_json(400, ['ok' => false, 'error' => 'token_manquant']);
}

$url = rtrim(MONEYFUSION_VERIFY_URL, '/') . '/' . rawurlencode($token);
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    CURLOPT_TIMEOUT        => 30,
]);
$resp = curl_exec($ch);
$err  = curl_error($ch);
curl_close($ch);

if ($resp === false) {
    error_log('[status] curl: ' . $err);
    bweb_json(502, ['ok' => false, 'error' => 'reseau']);
}

$data = json_decode($resp, true) ?: [];
$statut  = strtolower((string) ($data['data']['statut'] ?? $data['statut'] ?? ''));
$montant = $data['data']['Montant'] ?? $data['data']['montant'] ?? $data['montant'] ?? null;

// Données personnalisées renvoyées (on y a mis les références de réservation).
$perso = $data['data']['personal_Info'] ?? $data['personal_Info'] ?? [];
$refs  = [];
if (is_array($perso)) {
    foreach ($perso as $p) {
        if (isset($p['refs']) && is_array($p['refs'])) { $refs = array_merge($refs, $p['refs']); }
    }
}

bweb_json(200, [
    'ok'      => true,
    'statut'  => $statut,
    'montant' => $montant !== null ? (float) $montant : null,
    'refs'    => $refs,
]);
