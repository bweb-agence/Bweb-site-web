<?php
// Révèle l'IP de SORTIE réelle du serveur Hostinger (celle qui appellera Money Fusion).
// C'est CETTE IP qu'il faut déclarer dans « Adresses IP autorisées » chez Money Fusion.
// À ouvrir dans le navigateur : https://pay.bwebagence.com/ipcheck.php
// ⚠️ À supprimer une fois l'IP relevée.
header('Content-Type: application/json; charset=utf-8');

$ch = curl_init('https://api.ipify.org?format=json');
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15]);
$out = curl_exec($ch);
curl_close($ch);

$ip = json_decode($out, true)['ip'] ?? null;
echo json_encode([
    'ip_sortie_a_whitelister' => $ip,
    'ip_serveur_inbound'      => $_SERVER['SERVER_ADDR'] ?? null,
    'note' => "Déclare 'ip_sortie_a_whitelister' chez Money Fusion, puis supprime ce fichier.",
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
