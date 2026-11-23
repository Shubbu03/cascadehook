package notifications

type Preferences struct {
	EmailSeverities []string   `json:"email_severities"`
	EmailEnabled    bool       `json:"email_enabled"`
	EmailCategories []Category `json:"email_categories"`
}

func DefaultPreferences() Preferences {
	return Preferences{EmailSeverities: []string{"info", "success", "warning", "error"}, EmailCategories: []Category{Delivery, Credentials, Usage, Team, Access, Project}}
}

func (preferences Preferences) Valid() bool {
	if preferences.EmailCategories == nil || len(preferences.EmailCategories) > 6 {
		return false
	}
	seen := make(map[Category]bool, len(preferences.EmailCategories))
	for _, category := range preferences.EmailCategories {
		if !category.Valid() || seen[category] {
			return false
		}
		seen[category] = true
	}

	severitySeen := map[string]bool{}
	for _, severity := range preferences.EmailSeverities {
		valid := severity == "info" || severity == "success" || severity == "warning" || severity == "error"
		if !valid || severitySeen[severity] {
			return false
		}
		severitySeen[severity] = true
	}
	return preferences.EmailSeverities != nil
}

type ProjectPreferences struct {
	EmailEnabled bool `json:"email_enabled"`
}
