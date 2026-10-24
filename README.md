# BindReady

BindReady is a small web page that writes the email asking a client for the documents needed to bind their insurance policy.

Paste a row copied from the Excel sheet (or type the document codes, e.g. `DMV, REG, TITLE` / `TLC (DRIVER)`), check the preview, then click **Open in Gmail**. Gmail opens a new message with To, Cc, subject and text filled in.

## Files

| File | What it is |
|---|---|
| `index.html` | The page |
| `style.css` | Colours and layout |
| `app.js` | Turns the codes into the email |
| `favicon.svg` | Browser tab icon |

## Changing the defaults

All in `app.js`:

- **Document codes**: the `DEFAULT_CODES` list at the top.
- **Email wording / subject**: `DEFAULT_SUBJECT` and `DEFAULT_BODY` near the top. `{name}`, `{policy}`, `{documents}` and `{signature}` are filled in automatically.
- **CC address**: search for `megainsurancenyc@gmail.com`.
- **Signature**: search for `"ABRAR"`.

Each person using the page can also change the email wording, signature, CC and codes under **Settings** on the page. Those changes are saved in their own browser only.

## Privacy

Nothing typed into the page is sent anywhere or saved online. Client details stay in your browser until you click Open in Gmail.

## Credit

Made by Abrar Rejwan Prince.
