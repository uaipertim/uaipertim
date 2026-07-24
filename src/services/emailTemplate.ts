export const getResetPasswordHtml = (resetLink: string): string => {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <title>Redefina sua senha no UaiPertim</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style type="text/css">
    body, table, td, a {
      -ms-text-size-adjust: 100%;
      -webkit-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
    }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background-color: #F7F4EF;
      margin: 0;
      padding: 0;
      width: 100% !important;
    }
    a[x-apple-data-detectors] {
      color: inherit !important;
      text-decoration: none !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
    }
  </style>
</head>
<body style="background-color: #F7F4EF; padding: 40px 0;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center">
        <!--[if (gte mso 9)|(IE)]>
        <table align="center" border="0" cellspacing="0" cellpadding="0" width="600">
        <tr>
        <td align="center" valign="top" width="600">
        <![endif]-->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #EADFD8; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 12px rgba(32,26,23,0.03);">
          
          <!-- Header Area -->
          <tr>
            <td align="center" style="padding: 40px 40px 20px 40px;">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" bgcolor="#E94F2F" style="border-radius: 16px; width: 48px; height: 48px; font-weight: 900; font-size: 20px; color: #ffffff; line-height: 48px; text-align: center;">
                    UP
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size: 24px; font-weight: 900; color: #201A17; padding-top: 16px; letter-spacing: -0.5px;">
                    Uai<span style="color: #E94F2F;">Pertim</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size: 11px; font-weight: bold; color: #756B66; text-transform: uppercase; letter-spacing: 1px; padding-top: 4px;">
                    Feito em Minas
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #EADFD8;"></table>
            </td>
          </tr>

          <!-- Content Area -->
          <tr>
            <td align="left" style="padding: 40px 40px 30px 40px; color: #201A17; font-size: 14px; line-height: 1.6;">
              <p style="margin: 0 0 16px 0; font-weight: bold; font-size: 16px;">Olá!</p>
              <p style="margin: 0 0 24px 0;">Recebemos uma solicitação para redefinir a senha da sua conta no UaiPertim.</p>
              <p style="margin: 0 0 32px 0;">Clique no botão abaixo para criar uma nova senha:</p>
              
              <!-- CTA Button -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                      <tr>
                        <td align="center" bgcolor="#E94F2F" style="border-radius: 12px;">
                          <a href="${resetLink}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 14px; font-weight: 900; color: #ffffff; text-decoration: none; border-radius: 12px; letter-spacing: 0.5px;">
                            Redefinir minha senha
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Fallback Link -->
              <p style="margin: 32px 0 0 0; font-size: 12px; color: #756B66; text-align: center; line-height: 1.5;">
                Caso o botão não funcione, copie e cole o endereço abaixo no navegador:
              </p>
              <p style="margin: 8px 0 0 0; font-size: 11px; word-break: break-all; text-align: center; color: #E94F2F;">
                <a href="${resetLink}" target="_blank" style="color: #E94F2F; text-decoration: underline;">
                  ${resetLink}
                </a>
              </p>
            </td>
          </tr>

          <!-- Safety Notice -->
          <tr>
            <td align="left" style="padding: 0 40px 40px 40px; color: #756B66; font-size: 12px; line-height: 1.6;">
              <p style="margin: 0 0 8px 0; border-top: 1px solid #EADFD8; padding-top: 20px;"></p>
              <p style="margin: 0 0 8px 0;">Se você não solicitou essa alteração, ignore esta mensagem. Sua senha continuará a mesma.</p>
              <p style="margin: 0; font-weight: bold; color: #BD351C;">Por segurança, não compartilhe este link.</p>
            </td>
          </tr>

          <!-- Footer Area -->
          <tr bgcolor="#F7F4EF">
            <td align="center" style="padding: 30px 40px; font-size: 12px; color: #756B66; line-height: 1.5;">
              <p style="margin: 0; font-weight: bold;">Equipe UaiPertim</p>
              <p style="margin: 4px 0 12px 0; font-style: italic;">Tudo pertim de você.</p>
              <p style="margin: 0; font-size: 11px; color: #9E9088;">&copy; ${new Date().getFullYear()} UaiPertim. Todos os direitos reservados.</p>
              <p style="margin: 4px 0 0 0; font-size: 10px; color: #9E9088; text-transform: uppercase; letter-spacing: 0.5px;">Belo Horizonte &bull; São João Batista do Glória &bull; Passos</p>
            </td>
          </tr>

        </table>
        <!--[if (gte mso 9)|(IE)]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export const getResetPasswordText = (resetLink: string): string => {
  return `Olá!

Recebemos uma solicitação para redefinir a senha da sua conta no UaiPertim.

Clique no link abaixo para criar uma nova senha:

${resetLink}

Se você não solicitou essa alteração, ignore esta mensagem. Sua senha continuará a mesma.

Por segurança, não compartilhe este link.

Equipe UaiPertim
Tudo pertim de você.
Feito em Minas.`;
};
