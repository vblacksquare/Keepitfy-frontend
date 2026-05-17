import axios from "axios"

export const api = axios.create({
  baseURL: "",
  withCredentials: true,
})

let isRefreshing = false
let failedQueue: any[] = []

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (token) {
      prom.resolve(token)
    } else {
      prom.reject(error)
    }
  })

  failedQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status !== 401) {
      return Promise.reject(error)
    }

    if (originalRequest._retry) {
      return Promise.reject(error)
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`
        return api(originalRequest)
      })
    }

    originalRequest._retry = true
    isRefreshing = true

    try {
      const res = await axios.post(
        "/api/v1/users/refresh/",
        {},
        { withCredentials: true }
      )

      const newAccess = res.data.access
      localStorage.setItem("access", newAccess)

      api.defaults.headers.common.Authorization = `Bearer ${newAccess}`

      processQueue(null, newAccess)

      return api(originalRequest)
    } catch (err) {
      processQueue(err, null)
      localStorage.removeItem("access")
      return Promise.reject(err)
    } finally {
      isRefreshing = false
    }
  }
)

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access")
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})
