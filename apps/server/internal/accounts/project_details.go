package accounts

import (
	"errors"
	"unicode"
	"unicode/utf8"
)

var ErrInvalidProjectDetails = errors.New("invalid project details")

type ProjectDetails struct {
	Description string `json:"description"`
	Environment string `json:"environment"`
}

func (details ProjectDetails) Valid() bool {
	validEnvironment := details.Environment == "" || details.Environment == "production" ||
		details.Environment == "staging" || details.Environment == "development"
	if !validEnvironment || !utf8.ValidString(details.Description) || utf8.RuneCountInString(details.Description) > 500 {
		return false
	}
	for _, ch := range details.Description {
		if unicode.IsControl(ch) && ch != '\n' && ch != '\t' {
			return false
		}
	}
	return true
}
