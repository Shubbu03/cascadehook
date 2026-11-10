package mailoutbox

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"net/url"
	"strings"
)

var notificationTemplate = template.Must(template.New("notification").Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{.Title}}</title></head>
<body style="margin:0;background:#f6f5f2;color:#1c1d20;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0"
style="width:100%;max-width:480px;background:#fff;border:1px solid #dedcd7;border-radius:10px">
<tr><td style="padding:22px 24px;border-bottom:1px solid #eeede9;font-size:20px;font-weight:600">
cascadehook<span style="color:#b45332">.</span></td></tr>
<tr><td style="padding:24px"><h1 style="margin:0;font-size:22px;line-height:1.4">{{.Title}}</h1>
<p style="margin:12px 0 24px;color:#626569;font-size:14px;line-height:1.7">{{.Body}}</p>
<a href="{{.InboxURL}}" style="display:inline-block;padding:12px 18px;background:#b45332;color:#fff;
border-radius:6px;font-size:14px;font-weight:600;text-decoration:none">View notifications</a></td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #eeede9;color:#626569;font-size:12px;line-height:1.7">
You enabled email alerts in Cascadehook. <a href="{{.SettingsURL}}" style="color:#b45332">Manage email preferences</a>
</td></tr></table></td></tr></table></body></html>`))

func notificationMessage(cfg Config, job Job) ([]byte, error) {
	base, err := url.Parse(cfg.InvitationURL)
	if err != nil || base.Host == "" {
		return nil, fmt.Errorf("invalid application URL")
	}
	base.Path = "/dashboard/organizations/" + job.OrganizationID.String() + "/notifications"
	inboxURL := base.String()
	base.Path = "/account"
	base.RawQuery = "section=notifications"
	settingsURL := base.String()
	data := struct{ Title, Body, InboxURL, SettingsURL string }{
		Title: job.Title, Body: job.Body, InboxURL: inboxURL, SettingsURL: settingsURL,
	}
	var html bytes.Buffer
	if err := notificationTemplate.Execute(&html, data); err != nil {
		return nil, err
	}
	subject := strings.NewReplacer("\r", " ", "\n", " ").Replace(job.Title)
	return json.Marshal(Message{
		From: cfg.From, ReplyTo: cfg.ReplyTo, To: []string{job.Email}, Subject: subject + " · Cascadehook",
		HTML: html.String(),
		Text: fmt.Sprintf("%s\n\n%s\n\nView notifications: %s\n\nManage email preferences: %s",
			job.Title, job.Body, inboxURL, settingsURL),
		Tags: []Tag{{Name: "cascadehook_job", Value: job.ID.String()}},
	})
}
