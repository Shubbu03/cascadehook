package mailoutbox

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"strings"
)

var invitationTemplate = template.Must(template.New("invitation").Parse(`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8">
<title>Your Cascadehook invitation</title></head>
<body style="margin:0;padding:0;background:#f6f5f2;color:#1c1d20;font-family:'IBM Plex Sans',Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">
You've been invited to {{.OrganizationName}}. Accept your invitation to join your team.
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0"
style="width:100%;max-width:480px;background:#ffffff;border:1px solid #dedcd7;border-radius:10px">
<tr><td style="padding:22px 24px;border-bottom:1px solid #eeede9">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:36px;vertical-align:middle" aria-hidden="true">
<div style="width:17px;height:4px;border-radius:1px;background:#b45332"></div>
<div style="width:17px;height:4px;margin:3px 0 3px 4px;border-radius:1px;background:#b45332"></div>
<div style="width:17px;height:4px;margin-left:8px;border-radius:1px;background:#b45332"></div>
</td><td style="font-size:20px;line-height:24px;font-weight:600;letter-spacing:-0.8px">
cascadehook<span style="color:#b45332">.</span></td>
</tr></table></td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0;font-size:24px;line-height:1.3;font-weight:600;letter-spacing:-0.5px">You're invited</h1>
<p style="margin:8px 0 20px;color:#626569;font-size:14px;line-height:1.6">Join your team on Cascadehook.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px">
<tr><td style="padding:0 16px 10px 0;color:#626569;font-size:12px;line-height:20px;vertical-align:top;width:92px">Organization</td>
<td style="padding:0 0 10px;color:#1c1d20;font-size:14px;line-height:20px;font-weight:600;word-break:break-word">{{.OrganizationName}}</td></tr>
<tr><td style="padding-right:16px;color:#626569;font-size:12px;line-height:20px">Your role</td>
<td style="color:#1c1d20;font-size:14px;line-height:20px">{{.Role}}</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td align="center" bgcolor="#b45332" style="border-radius:6px">
<a href="{{.URL}}" style="display:block;padding:13px 20px;border:1px solid #b45332;border-radius:6px;
color:#ffffff;font-size:14px;line-height:20px;font-weight:600;text-align:center;text-decoration:none">Accept invitation</a>
</td></tr></table>
<p style="margin:12px 0 0;color:#626569;font-size:12px;line-height:1.6;text-align:center">
New here? Your account is created when you join.</p>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #eeede9">
<p style="margin:0;color:#626569;font-size:12px;line-height:1.6">This personal invitation expires {{.Expiry}}.</p>
</td></tr></table>
<p style="margin:16px 0 0;color:#626569;font-size:11px;line-height:1.6">Not expecting this? You can ignore this email.</p>
</td></tr></table></body></html>`))

func invitationMessage(cfg Config, job Job, link string) ([]byte, error) {
	data := struct{ OrganizationName, Role, URL, Expiry string }{
		OrganizationName: job.OrganizationName, Role: "Member", URL: link,
		Expiry: job.ExpiresAt.UTC().Format("2 Jan 2006 at 15:04 UTC"),
	}
	if job.Role == "admin" {
		data.Role = "Admin"
	}
	var body bytes.Buffer
	if err := invitationTemplate.Execute(&body, data); err != nil {
		return nil, err
	}
	name := strings.NewReplacer("\r", " ", "\n", " ").Replace(job.OrganizationName)
	message := Message{
		From: cfg.From, To: []string{job.Email}, Subject: "You're invited to " + name + " on Cascadehook",
		HTML: body.String(),
		Tags: []Tag{{Name: "cascadehook_job", Value: job.ID.String()}},
		Text: fmt.Sprintf(
			"Join %s on Cascadehook as %s.\n\nAccept invitation: %s\n\nExpires %s. "+
				"This link is personal to you.\nIf you weren't expecting this invitation, ignore this email.",
			name, job.Role, link, data.Expiry,
		),
	}
	return json.Marshal(message)
}
