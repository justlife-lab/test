// Development provider — prints emails to the server log instead of sending.
export default {
  name: 'console',
  async send({ to, subject, text }) {
    console.log(`\n📧 [email:console] To: ${to}\nSubject: ${subject}\n${text?.slice(0, 600)}\n`);
    return { id: `console-${Date.now()}` };
  },
};
