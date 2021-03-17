package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

//ripped and hacked from
	//	https://gist.github.com/chanioxaris/563a503d86e2c426cf585ac294d2376e#file-go-recaptcha-handler-go
	//  https://levelup.gitconnected.com/protect-your-endpoints-with-google-recaptcha-in-go-f4da5669ed9
	//  thank you Haris Chaniotakis!
type SiteVerifyResponse struct {
	Success     bool      `json:"success"`
	Score       float64   `json:"score"`
	Action      string    `json:"action"`
	ChallengeTS time.Time `json:"challenge_ts"`
	Hostname    string    `json:"hostname"`
	ErrorCodes  []string  `json:"error-codes"`
}

func CheckRecaptcha(secret, response string) error {
	siteVerifyURL := "https://www.google.com/recaptcha/api/siteverify"
	req, err := http.NewRequest(http.MethodPost, siteVerifyURL, nil)
	if err != nil {
		return err
	}

	// Add necessary request parameters.
	q := req.URL.Query()
	q.Add("secret", secret)
	q.Add("response", response)
	req.URL.RawQuery = q.Encode()

	// Make request
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// Decode response.
	var body SiteVerifyResponse
	if err = json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return err
	}

	// Check recaptcha verification success.
	if !body.Success {
		return errors.New("unsuccessful recaptcha verify request")
	}

	// Check response score.
	if body.Score < 0.5 {
		return errors.New("lower received score than expected")
	}

	// Check response action.
	if body.Action != "wlrequest" {
		return errors.New("mismatched recaptcha action")
	}

	return nil
}
