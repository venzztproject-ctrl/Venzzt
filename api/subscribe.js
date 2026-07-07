export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const apiKey = process.env.MAILERLITE_API_KEY;
  const groupId = process.env.MAILERLITE_GROUP_ID;

  if (!apiKey || !groupId) {
    return res.status(500).json({ success: false, message: 'MailerLite configuration missing' });
  }

  const { name, email, country, phone } = req.body || {};

  if (!name || !email || !country || !phone) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const findGroupId = async (groupKey) => {
    const normalized = String(groupKey).trim();
    if (!normalized) return null;

    if (/^[0-9]+$/.test(normalized) || /^[0-9a-fA-F-]{36}$/.test(normalized)) {
      return normalized;
    }

    const groupsRes = await fetch('https://connect.mailerlite.com/api/groups', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    const groupsData = await groupsRes.json().catch(() => null);
    const groups = Array.isArray(groupsData) ? groupsData : groupsData?.data || [];
    if (!Array.isArray(groups)) return null;

    return groups.find((group) => {
      const name = String(group.name || '').trim().toLowerCase();
      const id = String(group.id || '').trim();
      return name === normalized.toLowerCase() || id === normalized;
    })?.id || null;
  };

  const resolvedGroupId = await findGroupId(groupId);
  if (!resolvedGroupId) {
    return res.status(500).json({ success: false, message: 'MailerLite group ID is invalid. Check MAILERLITE_GROUP_ID in Vercel.' });
  }

  try {
    const formatDate = (date) => {
      const pad = (value) => String(value).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    const mailerRes = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        email,
        fields: {
          name,
          phone,
          country,
        },
        groups: [resolvedGroupId],
        status: 'active',
        opted_in_at: formatDate(new Date()),
      }),
    });

    const data = await mailerRes.json().catch(() => ({}));

    if (mailerRes.ok || mailerRes.status === 409) {
      return res.status(200).json({ success: true, message: data.message || 'Subscribed' });
    }

    return res.status(mailerRes.status).json({ success: false, message: data.message || 'MailerLite error', details: data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
}
