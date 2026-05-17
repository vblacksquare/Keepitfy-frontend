
import {
  Button
} from "@/components/ui/button"

import { useAuth } from "@/providers/AuthProvider"
import { useNavigate } from "react-router-dom"


export default function Dashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const doLogout = async () => {
    logout()
    navigate("/login")
  }

  return (
    <>
      <p>Hello</p>
      <Button onClick={doLogout}>logout</Button>
    </>
  );
}
