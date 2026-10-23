#!/bin/sh
# Crea l'account admin SOLO nell'emulatore locale (npm run emulators), con una password di test.
curl -s -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key" \
  -H 'Content-Type: application/json' \
  -d '{"email":"base@admin.com","password":"emulatore-admin","returnSecureToken":false}' > /dev/null && echo "Admin di test creato nell'emulatore"
