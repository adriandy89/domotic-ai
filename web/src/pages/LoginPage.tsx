import { Github } from 'lucide-react';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Link } from 'react-router-dom';

export default function LoginPage() {
  const handleLogin = (provider: string) => {
    // Redirect to backend auth endpoint
    // Assuming api is at localhost:3000/api/v1 (proxied or direct)
    // We use window.location.href because it's an external redirect
    window.location.href = `${import.meta.env.VITE_API_URL || 'http://localhost:3017/api/v1'}/auth/${provider}`;
  };

  return (
    <Card className="w-full shadow-2xl border-border bg-card/80 backdrop-blur-xl">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary to-purple-500 flex items-center justify-center shadow-lg shadow-primary/30">
            <div className="w-6 h-6 border-2 border-white rounded-full" />
          </div>
        </div>
        <CardTitle className="text-3xl font-bold tracking-tight text-foreground">
          Welcome back
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Sign in to your Domotic AI dashboard
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Button
          variant="outline"
          className="w-full gap-2 h-11 text-base hover:bg-[#24292F] hover:text-white border-border transition-all duration-300 text-foreground"
          onClick={() => handleLogin('github')}
        >
          <Github className="w-5 h-5" />
          Continue with GitHub
        </Button>
        <Button
          variant="outline"
          className="w-full gap-2 h-11 text-base hover:bg-[#DB4437] hover:text-white border-border transition-all duration-300 text-foreground"
          onClick={() => handleLogin('google')}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="currentColor"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="currentColor"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="currentColor"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="currentColor"
            />
          </svg>
          Continue with Google
        </Button>
        <Button
          variant="outline"
          className="w-full gap-2 h-11 text-base hover:bg-[#00A4EF] hover:text-white border-border transition-all duration-300 text-foreground"
          onClick={() => handleLogin('microsoft')}
        >
          <svg className="w-5 h-5" viewBox="0 0 21 21">
            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
          </svg>
          Continue with Microsoft
        </Button>
      </CardContent>
      <CardFooter>
        <div className="text-sm text-center w-full text-muted-foreground">
          Don't have an account?{' '}
          <Link
            to="/register"
            className="text-primary hover:text-primary/80 hover:underline transition-colors font-medium"
          >
            Sign up
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
