import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export function NotFoundPage(): JSX.Element {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Page not found</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[#6B7280]">
            The page you&rsquo;re looking for doesn&rsquo;t exist in this dashboard.
          </p>
          <Link
            to="/"
            className="inline-flex h-9 items-center justify-center rounded bg-[#1E3A5F] px-4 text-sm font-medium text-white hover:bg-[#152a48]"
          >
            Back to Overview
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
