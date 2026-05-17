import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardAction
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/providers/AuthProvider"
import { useNavigate } from "react-router-dom"


export function VerifyForm({ ...props }: React.ComponentProps<typeof Card>) {
  const navigate = useNavigate();

  const { verify, verifyUsername, resendCode } = useAuth();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (code.length !== 6) {
        setError("Code must be 6 digits")
        return
      }

      verify(code)
      navigate("/")

    } catch (err) {
      setError("Invalid code")
    } finally {
      setLoading(false)
    }
  }

  const resend = async () => {
    await resendCode();
  }

  useEffect(() => {
    if (verifyUsername == null){
      navigate("/login")
    }
  }, [])


  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>Verify code</CardTitle>
        <CardDescription>
          Enter the 6-digit code we sent you
        </CardDescription>

        <CardAction>
          <Button size="icon" variant="outline" onClick={() => {navigate("/signup")}}><XIcon /></Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <div className="flex gap-5">
                <FieldLabel htmlFor="code">Verification code</FieldLabel>
              </div>

              <Input
                id="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, ""))
                }
              />

              <FieldDescription>
                Enter the 6-digit code from email
              </FieldDescription>
            </Field>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <FieldGroup>
              <Field>
                <Button type="submit" disabled={loading}>
                  {loading ? "Verifying..." : "Verify"}
                </Button>

                <Button type="button" variant="outline" onClick={resend}>
                  Resend code
                </Button>
                
              </Field>
            </FieldGroup>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}