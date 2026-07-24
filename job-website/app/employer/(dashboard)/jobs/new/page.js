import JobForm from '../../../../../components/JobForm';

export default function NewEmployerJobPage() {
  return (
    <div>
      <h1 style={{ color: '#0D2B4E' }}>Post a new role</h1>
      <JobForm basePath="/api/employer/jobs" redirectPath="/employer/jobs" />
    </div>
  );
}
