// The send email hook. GoTrue calls this instead of sending an account email itself.

import { render } from '@react-email/render';

import { sendEmail } from '../_shared/email/send.ts';
import { compose, isSigned, payloadSchema } from './hook.ts';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const body = await request.text();
  // This endpoint takes a token and an address and would happily mail one to the other, so an
  // unsigned call is refused before anything is rendered.
  if (!(await isSigned(request.headers, body))) {
    return new Response(JSON.stringify({ error: 'unsigned' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const parsed = payloadSchema.safeParse(JSON.parse(body));
  if (!parsed.success) {
    console.error('the auth hook sent something unreadable');
    return new Response(JSON.stringify({ error: 'unreadable' }), { status: 400 });
  }

  try {
    const { to, rendered } = compose(parsed.data);
    await sendEmail({ to, subject: rendered.subject, html: await render(rendered.body) });
  } catch (error) {
    // GoTrue shows this to the person who triggered it, so it says nothing about the token.
    console.error('an account email could not be sent', error);
    return new Response(
      JSON.stringify({ error: { http_code: 500, message: 'the email could not be sent' } }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  return new Response('{}', { headers: { 'content-type': 'application/json' } });
});
