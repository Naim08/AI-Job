import React from "react";
import { useActivity, ActivityItem } from "../contexts/ActivityContext";

const ActivityPage: React.FC = () => {
  const { activities } = useActivity();

  const getIconForType = (type: ActivityItem["type"]) => {
    switch (type) {
      case "success":
        return "✅";
      case "error":
        return "❌";
      case "warning":
        return "⚠️";
      case "info":
        return "ℹ️";
      default:
        return "➡️";
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Activity Log</h1>
      {activities.length === 0 ? (
        <p className="text-gray-500">
          No recent activity. Or, activities might be loading...
        </p>
      ) : (
        <div className="space-y-4">
          {activities.map((activity, index) => (
            <div
              key={`activity-${activity.id || index}`}
              className="p-4 rounded-lg shadow bg-base-100"
            >
              <div className="flex items-start">
                <span className="text-xl mr-3">
                  {getIconForType(activity.type)}
                </span>
                <div className="flex-grow">
                  <p
                    className={`font-semibold ${
                      activity.type === "error"
                        ? "text-red-500"
                        : activity.type === "success"
                        ? "text-green-500"
                        : ""
                    }`}
                  >
                    {activity.message}
                  </p>
                  {activity.details && (
                    <p className="text-sm text-gray-600 mt-1">
                      {activity.details}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(activity.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ActivityPage;
