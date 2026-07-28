<?php
// =========================================================
//  Bweb Agence — Relais paiement Money Fusion (PHP)
//  À héberger sur Hostinger (hPanel). Les appels à Money Fusion
//  partent d'ici → depuis l'IP FIXE de l'hébergement Hostinger,
//  la seule autorisée par Money Fusion.
// =========================================================

// --- Identifiants Money Fusion (app "Site_web_bwebagence") ---
// Lien API (création de paiement) généré par Money Fusion :
const MONEYFUSION_API_URL    = 'https://pay.moneyfusion.net/VOTRE_APP/VOTRE_HASH/pay/'; // valeur réelle configurée sur Hostinger
// Lien de vérification du statut (endpoint officiel FusionPay, ne pas changer) :
const MONEYFUSION_VERIFY_URL = 'https://www.pay.moneyfusion.net/paiementNotif';

// URL de retour sur le site après paiement (page déjà créée) :
const RETURN_URL = 'https://www.bwebagence.com/formations/paiement-retour';

// URL publique de CE relais (pour le webhook Money Fusion) :
const PUBLIC_BASE_URL = 'https://pay.bwebagence.com';

// Endpoint du site (Vercel) qui confirme la réservation après paiement :
const CONFIRM_URL = 'https://www.bwebagence.com/api/paiement-confirme';

// Origine autorisée à appeler ce relais (le site) :
const ALLOWED_ORIGIN = 'https://www.bwebagence.com';

// --- En-têtes communs (CORS + JSON) ---
function bweb_cors() {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = [ALLOWED_ORIGIN, 'https://bwebagence.com'];
    if (in_array($origin, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
    }
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Content-Type: application/json; charset=utf-8');
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
}

function bweb_json($status, $data) {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
