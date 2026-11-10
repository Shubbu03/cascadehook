package mailoutbox

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestNotificationMessageEscapesContentAndLinksPreferences(t *testing.T) {
	job := Job{
		ID: uuid.New(), OrganizationID: uuid.New(), Email: "member@example.com",
		Title: "<script>alert(1)</script>\r\nTitle", Body: "A receiver named <img src=x onerror=alert(1)> failed.",
	}
	body, err := notificationMessage(Config{InvitationURL: "https://app.example.com/invitations/accept", From: "alerts@example.com"}, job)
	if err != nil {
		t.Fatal(err)
	}
	var message Message
	if err := json.Unmarshal(body, &message); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(message.HTML, "<script>") || strings.Contains(message.HTML, "<img src=x") {
		t.Fatal("unsafe notification content reached the HTML body")
	}
	if strings.ContainsAny(message.Subject, "\r\n") {
		t.Fatal("subject contains control characters")
	}
	for _, link := range []string{
		"https://app.example.com/dashboard/organizations/" + job.OrganizationID.String() + "/notifications",
		"https://app.example.com/account?section=notifications",
	} {
		if !strings.Contains(message.HTML, link) || !strings.Contains(message.Text, link) {
			t.Fatalf("missing actionable link %s", link)
		}
	}
	if len(message.To) != 1 || message.To[0] != job.Email {
		t.Fatalf("wrong recipient: %v", message.To)
	}
}
