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
import { passwordSchema } from "@/components/signup-form"


export function ResetForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const navigate = useNavigate();

  const { recoveryEmail, recoveryCode, resetPassword } = useAuth()

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isEblan, setIsEblan] = useState<boolean>(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (password !== confirmPassword){
        setError("Passwords do not match")
        return
      }
      
      const result = passwordSchema.safeParse(password);
      
      if (!result.success) {
        setError(result.error.issues[0].message)
        return
      }

      await resetPassword(password)
      setIsEblan(true);
    } catch (err) {
      setError("Wrong code")
    } finally {
      setLoading(false)
    }
  }

  
  useEffect(() => {
    if (recoveryEmail == null || recoveryCode == null){
      navigate("/login")
    }
  }, [])

  return (
    isEblan ? (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Your password changed 🍤</CardTitle>
          <CardDescription>
            You can login with your new password now
          </CardDescription>

        </CardHeader>

        <CardContent>
          <FieldGroup>
            <Field>
              <Button type="submit" disabled={loading} onClick={() => {navigate('/login')}}>
                Login
              </Button>
              
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
    )
    :
    (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Choose your new password</CardTitle>
          <CardDescription>
            Choose it visely 💀
          </CardDescription>

          <CardAction>
            <Button size="icon" variant="outline" onClick={() => {navigate("/recovery")}}><XIcon /></Button>
          </CardAction>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>

              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="super-secret-67"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <FieldDescription>
                  Must be at least 8 characters long and have 1 number or special charachter.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="confirm-password">
                  Confirm Password
                </FieldLabel>
                <Input 
                  id="confirm-password" 
                  type="password" 
                  placeholder="super-secret-67"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <FieldDescription>Please confirm your password.</FieldDescription>
              </Field>

              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}

              <Field>
                <Button type="submit" disabled={loading}>
                  {loading ? "Changing..." : "Change"}
                </Button>
                
              </Field>

            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
    )
  )
}