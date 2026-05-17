import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useNavigate } from "react-router-dom"
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
  FieldGroup,
  FieldLabel,
  FieldDescription
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/providers/AuthProvider";


export function ConfirmRecoveryForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const navigate = useNavigate();

  const { recoveryEmail, confirmForgot, forgotPassword } = useAuth()

  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (code.length !== 6){
        setError("Code minimum length is 6")
        return
      }

      await confirmForgot(code)
      navigate("/reset")
    } catch (err) {
      setError("Wrong code")
    } finally {
      setLoading(false)
    }
  }

  const resend = async () => {
    if (recoveryEmail){
      await forgotPassword(recoveryEmail);
    }
  }

  useEffect(() => {
    if (recoveryEmail == null){
      navigate("/login")
    }
  }, [])

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Recover your account</CardTitle>
          <CardDescription>
            If you entered the right email you will get the code
          </CardDescription>

          <CardAction>
            <Button size="icon" variant="outline" onClick={() => {navigate("/recovery")}}><XIcon /></Button>
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

              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}

              <Field>
                <Button type="submit" disabled={loading}>
                  {loading ? "Sending code..." : "Send code"}
                </Button>
                
                <Button type="button" variant="outline" onClick={resend}>
                  Resend code
                </Button>
                
              </Field>

            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}