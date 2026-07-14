$baseUrl = "http://localhost:5000"
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

Write-Output "GET /login"
try { $r = Invoke-WebRequest "$baseUrl/login" -WebSession $session -UseBasicParsing; Write-Output "GET /login status: $($r.StatusCode)" } catch { Write-Output "GET /login error: $($_.Exception.Message)" }

Write-Output "GET /register"
try { $r = Invoke-WebRequest "$baseUrl/register" -WebSession $session -UseBasicParsing; Write-Output "GET /register status: $($r.StatusCode)" } catch { Write-Output "GET /register error: $($_.Exception.Message)" }

Write-Output "POST /register (attempt)"
$body = @{ name='AutoTest'; email='autotest+1@example.com'; password='password123'; password2='password123'; role='eleve'; student_class='1A'; matricule='AT123' }
try {
  $r = Invoke-WebRequest "$baseUrl/register" -Method Post -Body $body -WebSession $session -MaximumRedirection 0 -ErrorAction Stop
  Write-Output "POST /register status: $($r.StatusCode)"
} catch {
  if ($_.Exception.Response) { Write-Output "POST /register response status: $($_.Exception.Response.StatusCode.Value__)" } else { Write-Output "POST /register error: $($_.Exception.Message)" }
}

Write-Output "POST /login (attempt)"
$login = @{ email='autotest+1@example.com'; password='password123' }
try {
  $r = Invoke-WebRequest "$baseUrl/login" -Method Post -Body $login -WebSession $session -MaximumRedirection 0 -ErrorAction Stop
  Write-Output "POST /login status: $($r.StatusCode)"
} catch {
  if ($_.Exception.Response) { Write-Output "POST /login response status: $($_.Exception.Response.StatusCode.Value__)" } else { Write-Output "POST /login error: $($_.Exception.Message)" }
}

Write-Output "GET /chat/api/unread"
try { $u = Invoke-RestMethod "$baseUrl/chat/api/unread" -WebSession $session -UseBasicParsing; Write-Output ("Unread: " + ($u | ConvertTo-Json -Compress)) } catch { Write-Output "Unread API error: $($_.Exception.Message)" }

Write-Output "GET /chat/api/conversations"
try { $c = Invoke-RestMethod "$baseUrl/chat/api/conversations" -WebSession $session -UseBasicParsing; Write-Output ("Conversations: " + ($c | ConvertTo-Json -Compress)) } catch { Write-Output "Conversations API error: $($_.Exception.Message)" }

Write-Output "GET /notifications/unread-count"
try { $n = Invoke-RestMethod "$baseUrl/api/notifications/unread-count" -WebSession $session -UseBasicParsing; Write-Output ("Notifications unread: " + ($n | ConvertTo-Json -Compress)) } catch { Write-Output "Notifications API error: $($_.Exception.Message)" }
