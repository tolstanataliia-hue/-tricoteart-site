// Cette fonction s'exécute sur les serveurs de Netlify (pas dans le navigateur).
// Elle reçoit le contenu du panier, demande à Stripe de créer une page de paiement
// sécurisée, et renvoie l'adresse (URL) de cette page au site.
//
// Elle n'utilise aucune bibliothèque externe (pas de "npm install" nécessaire),
// donc elle fonctionne même avec un déploiement simple.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "La clé secrète Stripe n'est pas configurée sur Netlify (STRIPE_SECRET_KEY)." })
    };
  }

  let items;
  try {
    const payload = JSON.parse(event.body || '{}');
    items = payload.items;
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Requête invalide.' }) };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Le panier est vide.' }) };
  }

  const origin = event.headers.origin || ('https://' + event.headers.host);

  // Stripe attend des données au format "application/x-www-form-urlencoded",
  // avec une notation particulière pour les listes (line_items[0][...]).
  const params = new URLSearchParams();
  params.append('mode', 'payment');
  params.append('payment_method_types[]', 'card');
  params.append('success_url', origin + '/merci.html?session_id={CHECKOUT_SESSION_ID}');
  params.append('cancel_url', origin + '/');

  // Pays de livraison autorisés — à ajuster librement selon votre clientèle.
  ['FR', 'BE', 'CH', 'LU', 'MC', 'DE', 'ES', 'IT', 'GB', 'US', 'CA'].forEach(c => {
    params.append('shipping_address_collection[allowed_countries][]', c);
  });

  items.forEach((it, i) => {
    const name = String(it.name || 'Article').slice(0, 120);
    const price = Math.round(Number(it.price) * 100); // euros -> centimes
    const qty = Math.max(1, parseInt(it.qty, 10) || 1);

    params.append(`line_items[${i}][price_data][currency]`, 'eur');
    params.append(`line_items[${i}][price_data][product_data][name]`, name);
    params.append(`line_items[${i}][price_data][unit_amount]`, String(price));
    params.append(`line_items[${i}][quantity]`, String(qty));
  });

  try {
    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + secretKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: (data.error && data.error.message) || 'Erreur Stripe.' })
      };
    }

    return { statusCode: 200, body: JSON.stringify({ url: data.url }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
