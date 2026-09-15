const { Resend } = require('resend');

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const DEFAULT_FROM = process.env.MAIL_FROM || 'Clofthel <no-reply@clofthel.com.tr>';
const FALLBACK_FROM = 'Clofthel <onboarding@resend.dev>';

/**
 * Modern, responsive HTML email template for Clofthel
 */
function createEmailHtml({ title, subtitle, code, message, warning }) {
  return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0c10; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0b0c10; padding: 30px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" max-width="500" cellspacing="0" cellpadding="0" border="0" style="max-width: 500px; background: #13151b; border: 1px solid #1f232e; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          
          <!-- Header Banner -->
          <tr>
            <td style="padding: 30px 30px 20px 30px; text-align: center; border-bottom: 1px solid #1f232e; background: linear-gradient(180deg, rgba(255,107,0,0.08) 0%, rgba(19,21,27,0) 100%);">
              <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: 2px; color: #FF6B00; text-transform: uppercase;">
                CLOFTHEL
              </h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #8a8f9d; letter-spacing: 0.5px;">
                ${subtitle || 'Anime & Manga Platformu'}
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 30px;">
              <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #ffffff; text-align: center;">
                ${title}
              </h2>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 22px; color: #a0a5b5; text-align: center;">
                ${message || 'İşleminizi tamamlamak için aşağıdaki 6 haneli doğrulama kodunu kullanın:'}
              </p>

              <!-- Code Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 24px 0;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background: #1a1d26; border: 1.5px dashed #FF6B00; border-radius: 12px; padding: 16px 36px;">
                      <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #FF6B00; font-family: 'Courier New', Courier, monospace;">
                        ${code}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Notice Box -->
              <div style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; text-align: center;">
                <p style="margin: 0; font-size: 12px; color: #8a8f9d;">
                  ⏳ Bu kod <strong>15 dakika</strong> boyunca geçerlidir.
                </p>
              </div>

              <p style="margin: 0; font-size: 12px; line-height: 18px; color: #636878; text-align: center;">
                ${warning || 'Bu işlemi siz başlatmadıysanız bu e-postayı güvenle yok sayabilirsiniz.'}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; text-align: center; border-top: 1px solid #1f232e; background: #0f1015;">
              <p style="margin: 0; font-size: 11px; color: #505565;">
                &copy; ${new Date().getFullYear()} Clofthel. Tüm hakları saklıdır.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

/**
 * Send email using Resend with automatic fallback
 */
async function sendMailWithFallback({ to, subject, html }) {
  if (!resend) {
    console.warn('[Mailer] RESEND_API_KEY is not defined. Email skipped.');
    return { success: false, error: 'RESEND_API_KEY eksik' };
  }

  // 1. Try with DEFAULT_FROM
  try {
    const result = await resend.emails.send({
      from: DEFAULT_FROM,
      to,
      subject,
      html
    });

    if (result.error) {
      console.warn(`[Mailer] Error with default sender ${DEFAULT_FROM}:`, result.error.message || result.error);
      
      // If domain verification error, try FALLBACK_FROM
      if (
        result.error.name === 'validation_error' || 
        (result.error.message && result.error.message.toLowerCase().includes('domain'))
      ) {
        console.log(`[Mailer] Retrying with fallback sender: ${FALLBACK_FROM}`);
        const fallbackResult = await resend.emails.send({
          from: FALLBACK_FROM,
          to,
          subject,
          html
        });
        if (fallbackResult.error) {
          console.error('[Mailer] Fallback sender also failed:', fallbackResult.error);
          return { success: false, error: fallbackResult.error.message };
        }
        return { success: true, data: fallbackResult.data };
      }

      return { success: false, error: result.error.message };
    }

    return { success: true, data: result.data };
  } catch (err) {
    console.error('[Mailer] Network/Unexpected error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Yeni Kullanıcı Kaydı Doğrulama E-postası
 */
async function sendVerificationEmail(email, code) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`\n======================================================`);
    console.log(`[VERIFICATION CODE] To: ${email} -> CODE: ${code}`);
    console.log(`======================================================\n`);
  }

  const html = createEmailHtml({
    title: "Clofthel'e Hoş Geldiniz!",
    subtitle: 'Hesap Doğrulama',
    code,
    message: "Clofthel'e kaydolduğunuz için teşekkürler! Hesabınızı aktifleştirmek için aşağıdaki 6 haneli doğrulama kodunu uygulamaya girin:",
    warning: 'Bu hesabı siz oluşturmadıysanız bu e-postayı güvenle silebilirsiniz.'
  });

  return sendMailWithFallback({
    to: email,
    subject: 'Clofthel Doğrulama Kodunuz: ' + code,
    html
  });
}

/**
 * Şifre Sıfırlama E-postası
 */
async function sendPasswordResetEmail(email, code) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`\n======================================================`);
    console.log(`[PASSWORD RESET CODE] To: ${email} -> CODE: ${code}`);
    console.log(`======================================================\n`);
  }

  const html = createEmailHtml({
    title: 'Şifre Sıfırlama Talebi',
    subtitle: 'Hesap Güvenliği',
    code,
    message: 'Clofthel hesabınız için bir şifre sıfırlama talebinde bulundunuz. Yeni şifrenizi belirlemek için aşağıdaki 6 haneli kodu kullanın:',
    warning: 'Bu talebi siz yapmadıysanız şifreniz değişmeyecektir. Lütfen hesabınızı güvende tutun.'
  });

  return sendMailWithFallback({
    to: email,
    subject: 'Clofthel Şifre Sıfırlama Kodunuz: ' + code,
    html
  });
}

/**
 * E-posta Değişikliği Doğrulama E-postası
 */
async function sendEmailUpdateCode(email, code) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`\n======================================================`);
    console.log(`[EMAIL UPDATE CODE] To: ${email} -> CODE: ${code}`);
    console.log(`======================================================\n`);
  }

  const html = createEmailHtml({
    title: 'E-posta Değişikliği Doğrulaması',
    subtitle: 'Hesap Güncelleme',
    code,
    message: 'Clofthel hesabınızın yeni e-posta adresi olarak bu adresi belirlediniz. Değişikliği onaylamak için aşağıdaki kodu girin:',
    warning: 'Bu değişikliği siz yapmadıysanız lütfen derhal destek ile iletişime geçin.'
  });

  return sendMailWithFallback({
    to: email,
    subject: 'Clofthel E-posta Değişikliği Kodunuz: ' + code,
    html
  });
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendEmailUpdateCode
};
