import { useState, useEffect } from 'react'

interface UserProfile {
  name: string
  email: string
  bio: string
  notifications: {
    email: boolean
    push: boolean
    sms: boolean
  }
}

export function UserSettings() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/user/profile')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load profile')
        return res.json()
      })
      .then((data) => {
        setProfile(data)
        setIsLoading(false)
      })
      .catch(() => {
        setError('Failed to load your profile. Please refresh the page.')
        setIsLoading(false)
      })
  }, [])

  const handleSave = async () => {
    if (!profile) return
    setIsSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.message || 'Failed to save')
        return
      }
      setSuccessMessage('Settings saved successfully!')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return <p>Loading your settings...</p>
  if (!profile) return <div role="alert">{error}</div>

  return (
    <div>
      <h1>Settings</h1>
      {error && <div role="alert">{error}</div>}
      {successMessage && <div role="status">{successMessage}</div>}

      <form onSubmit={(e) => { e.preventDefault(); handleSave() }}>
        <label>
          Name
          <input
            type="text"
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          />
        </label>

        <label>
          Bio
          <textarea
            value={profile.bio}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          />
        </label>

        <fieldset>
          <legend>Notification Preferences</legend>
          <label>
            <input
              type="checkbox"
              checked={profile.notifications.email}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  notifications: { ...profile.notifications, email: e.target.checked },
                })
              }
            />
            Email notifications
          </label>
          <label>
            <input
              type="checkbox"
              checked={profile.notifications.push}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  notifications: { ...profile.notifications, push: e.target.checked },
                })
              }
            />
            Push notifications
          </label>
          <label>
            <input
              type="checkbox"
              checked={profile.notifications.sms}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  notifications: { ...profile.notifications, sms: e.target.checked },
                })
              }
            />
            SMS notifications
          </label>
        </fieldset>

        <button type="submit" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}
