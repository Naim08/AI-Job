import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { ReviewModal } from "../components/ReviewModal";
import { useModal } from "../lib/useModal";
import type { ApplicationStatus, DecisionNode } from "../shared/types";

interface ApplicationRow {
  id: string;
  job_title: string;
  company_name: string;
  status: ApplicationStatus;
}

const HistoryPage: React.FC = () => {
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [selectedApp, setSelectedApp] = useState<ApplicationRow | null>(null);
  const { open, openModal, closeModal } = useModal();

  useEffect(() => {
    supabase
      .from("job_applications")
      .select("id, job_title, company_name, status")
      .then(({ data, error }) => {
        if (error) {
          console.error("Error fetching job applications:", error);
        } else {
          const mappedData = (data || []).map((app) => ({
            ...app,
            id: app.id,
            status: (app.status || "pending_review") as ApplicationStatus,
          }));
          setApps(mappedData);
        }
      });
  }, []);

  const handleReview = (app: ApplicationRow) => {
    setSelectedApp(app);
    openModal();
  };

  const handleStatusChange = (status: string) => {
    setApps((apps) =>
      apps.map((a) =>
        a.id === selectedApp?.id
          ? { ...a, status: status as ApplicationStatus }
          : a
      )
    );
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Application History</h1>
      <table className="table w-full">
        <thead>
          <tr>
            <th>Job Title</th>
            <th>Company</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {apps.map((app) => (
            <tr key={app.id}>
              <td>{app.job_title}</td>
              <td>{app.company_name}</td>
              <td>{app.status}</td>
              <td>
                {app.status === ("pending_review" as ApplicationStatus) && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleReview(app)}
                  >
                    Review
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ReviewModal
        open={open}
        onClose={closeModal}
        selectedApp={selectedApp}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
};

export default HistoryPage;
