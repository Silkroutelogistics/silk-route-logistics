const API = 'https://api.silkroutelogistics.ai';

async function main() {
  // Login
  const loginRes = await fetch(API + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'noor@silkroutelogistics.ai', password: 'Wasishah3089$' })
  });
  const loginData = await loginRes.json();
  if (!loginData.token) {
    console.log('Login failed:', JSON.stringify(loginData));
    return;
  }
  console.log('Login OK, user:', loginData.user.firstName, loginData.user.lastName);
  const token = loginData.token;
  const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };

  // Get carriers
  const carriersRes = await fetch(API + '/api/carriers?limit=3', { headers });
  const carriersData = await carriersRes.json();
  const c = carriersData.carriers[0];
  console.log('Carrier:', c.company, '| email:', c.email, '| userId:', c.userId);

  // Send test email to carrier
  const emailRes = await fetch(API + '/api/email/send', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      to: c.email,
      subject: 'Test Carrier Email - Silk Route Logistics',
      customBody: 'Hi ' + c.contactName + ',<br><br>This is a test email from the Communications Hub to verify carrier email sending is working correctly.<br><br>We have loads available in your lanes. Let us know your availability.',
      entityType: 'CARRIER',
      entityId: c.userId
    })
  });
  const emailResult = await emailRes.json();
  console.log('Email status:', emailRes.status);
  console.log('Email result:', JSON.stringify(emailResult, null, 2));
}

main().catch(e => console.error('Error:', e.message));
