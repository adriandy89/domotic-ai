import { User } from 'lucide-react';
import { Badge } from '../ui/badge';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { useAuthStore } from '../../store/useAuthStore';

export default function ProfileCard() {
  const { user } = useAuthStore();

  return (
    <Card className="bg-card/40 border-border">
      <CardHeader className="flex flex-row items-center space-x-2 pb-3">
        <div className="p-3 bg-primary/10 rounded-full">
          <User className="h-8 w-8 text-primary" />
        </div>
        <div>
          <CardTitle className="text-xl flex items-center gap-2">
            {user?.name}
            {user?.role && <Badge variant="default">{user.role}</Badge>}
          </CardTitle>
          <CardDescription className="flex md:flex-row flex-col md:gap-2">
            <span>{user?.email}</span>
            {user?.phone && <span>+{user.phone}</span>}
          </CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}
