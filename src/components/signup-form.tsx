import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/providers/AuthProvider";

import { z } from "zod";


export const passwordSchema = z
  .string()
  .min(8, "Password minimum length is 8")
  .refine(
    (val) => /[0-9]/.test(val) || /[!@#$%^&*]/.test(val),
    {
      message: "Password has to include at least 1 number or special charachter",
    }
  );


export function SignupForm({ ...props }: React.ComponentProps<typeof Card>) {
  const { register } = useAuth()

  const navigate = useNavigate();

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {

      if (password !== confirmPassword){
        setError("Passwords do not match")
      }
      const result = passwordSchema.safeParse(password);
      
      if (!result.success) {
        setError(result.error.issues[0].message)
        return
      }

      await register({ email: username, password: password })
      navigate("/verify")

    } catch (err) {
      setError("Such user already exists")
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>
          Enter your information below to create your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="mclovin@gmail.com"
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <FieldDescription>
                We&apos;ll use this to contact you. We will not share your email
                with anyone else.
              </FieldDescription>
            </Field>

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

            <FieldGroup>
              <Field>
                <Button type="submit" disabled={loading}>
                  {loading ? "Creating..." : "Create Account"}
                </Button>
                <Button variant="outline" type="button">
                  Sign up with Google
                </Button>
                <FieldDescription className="px-6 text-center">
                  Already have an account? <Link to="/login">Sign in</Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
