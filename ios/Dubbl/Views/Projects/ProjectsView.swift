import SwiftUI

struct ProjectListView: View {
    @StateObject private var viewModel: ListViewModel<Project>
    @State private var selectedStatus: String?
    @State private var showCreateForm = false
    @State private var selectedProject: Project?

    init() {
        let service = ProjectService()
        _viewModel = StateObject(wrappedValue: ListViewModel<Project> { page, limit, filter, _ in
            try await service.list(page: page, limit: limit, status: filter)
        })
    }

    var body: some View {
        VStack(spacing: 0) {
            FilterChips(options: [
                ("All", nil),
                ("Active", "active"),
                ("On Hold", "on_hold"),
                ("Completed", "completed"),
            ], selected: $selectedStatus)
            .onChange(of: selectedStatus) { newValue in
                Task { await viewModel.filter(newValue) }
            }
            .padding(.vertical, 8)

            if viewModel.items.isEmpty && !viewModel.isLoading {
                EmptyStateView(
                    icon: "folder",
                    title: "No Projects",
                    message: "Create a project to start tracking work and time.",
                    actionTitle: "New Project",
                    action: { showCreateForm = true }
                )
            } else {
                List {
                    ForEach(viewModel.items) { project in
                        Button(action: { selectedProject = project }) {
                            HStack(spacing: 12) {
                                Circle()
                                    .fill(Color.dubblPrimary)
                                    .frame(width: 10, height: 10)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(project.name)
                                        .font(.subheadline).fontWeight(.medium)
                                        .foregroundColor(.primary)
                                    HStack(spacing: 8) {
                                        if let status = project.status {
                                            StatusBadge(status.displayName, color:
                                                status == .active ? .dubblPrimary :
                                                status == .completed ? .dubblInfo : .dubblMuted)
                                        }
                                        if let contact = project.contact {
                                            Text(contact.name)
                                                .font(.caption).foregroundColor(.dubblMuted)
                                        }
                                    }
                                }
                                Spacer()
                                if let budget = project.budget, budget > 0 {
                                    Text(budget.asCurrency())
                                        .font(.caption).foregroundColor(.dubblMuted)
                                }
                            }
                        }
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                    }
                }
                .listStyle(.plain)
            }
        }
        .background(Color.dubblBackground.ignoresSafeArea())
        .dubblNavigationTitle("Projects")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { showCreateForm = true }) {
                    Image(systemName: "plus").foregroundColor(.dubblPrimary)
                }
            }
        }
        .refreshable { await viewModel.refresh() }
        .task { await viewModel.load() }
        .sheet(item: $selectedProject) { project in
            ProjectDetailView(projectId: project.id)
        }
        .sheet(isPresented: $showCreateForm) {
            ProjectFormView { Task { await viewModel.refresh() } }
        }
        .overlay {
            if viewModel.isLoading && viewModel.items.isEmpty { LoadingView() }
        }
    }
}

// MARK: - Project Detail

struct ProjectDetailView: View {
    let projectId: String
    @State private var project: Project?
    @State private var tasks: [ProjectTask] = []
    @State private var timeEntries: [TimeEntry] = []
    @State private var milestones: [ProjectMilestone] = []
    @State private var isLoading = true
    @State private var selectedTab = 0
    @State private var showAddTask = false
    @State private var showAddTime = false
    @Environment(\.dismiss) private var dismiss

    private let service = ProjectService()

    var body: some View {
        NavigationView {
            Group {
                if isLoading {
                    LoadingView()
                } else if let project = project {
                    VStack(spacing: 0) {
                        // Project Header
                        VStack(spacing: 8) {
                            Text(project.name).font(.title2).fontWeight(.bold)
                            if let status = project.status {
                                StatusBadge(status.displayName)
                            }
                            if let budget = project.budget, budget > 0 {
                                HStack {
                                    Text("Budget: \(budget.asCurrency())")
                                    if let billed = project.totalBilled, billed > 0 {
                                        Text("Billed: \(billed.asCurrency())")
                                    }
                                }
                                .font(.caption).foregroundColor(.dubblMuted)
                            }
                        }
                        .frame(maxWidth: .infinity).padding().dubblCard()

                        Picker("Tab", selection: $selectedTab) {
                            Text("Tasks").tag(0)
                            Text("Time").tag(1)
                            Text("Milestones").tag(2)
                        }
                        .pickerStyle(.segmented).padding()

                        if selectedTab == 0 {
                            tasksList
                        } else if selectedTab == 1 {
                            timeEntriesList
                        } else {
                            milestonesList
                        }
                    }
                }
            }
            .background(Color.dubblBackground.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") { dismiss() }.foregroundColor(.dubblPrimary)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Menu {
                        Button(action: { showAddTask = true }) { Label("Add Task", systemImage: "checklist") }
                        Button(action: { showAddTime = true }) { Label("Log Time", systemImage: "clock") }
                    } label: {
                        Image(systemName: "plus").foregroundColor(.dubblPrimary)
                    }
                }
            }
            .task { await load() }
        }
    }

    private var tasksList: some View {
        List {
            ForEach(tasks) { task in
                HStack {
                    Image(systemName: task.status == .done ? "checkmark.circle.fill" : "circle")
                        .foregroundColor(task.status == .done ? .dubblPrimary : .dubblMuted)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(task.title).font(.subheadline)
                            .strikethrough(task.status == .done)
                        if let status = task.status {
                            Text(status.displayName).font(.caption).foregroundColor(.dubblMuted)
                        }
                    }
                    Spacer()
                    if let due = task.dueDate {
                        Text(due).font(.caption2).foregroundColor(.dubblMuted)
                    }
                }
            }
        }
        .listStyle(.plain)
    }

    private var timeEntriesList: some View {
        List {
            ForEach(timeEntries) { entry in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.description ?? "Time Entry").font(.subheadline)
                        Text(entry.date ?? "").font(.caption).foregroundColor(.dubblMuted)
                    }
                    Spacer()
                    Text((entry.duration ?? 0).minutesToHoursMinutes())
                        .font(.subheadline).fontWeight(.medium)
                }
            }
        }
        .listStyle(.plain)
    }

    private var milestonesList: some View {
        List {
            ForEach(milestones) { milestone in
                VStack(alignment: .leading, spacing: 4) {
                    Text(milestone.name).font(.subheadline).fontWeight(.medium)
                    if let due = milestone.dueDate {
                        Text("Due: \(due)").font(.caption).foregroundColor(.dubblMuted)
                    }
                    if let progress = milestone.progress {
                        ProgressView(value: Double(progress), total: 100)
                            .tint(.dubblPrimary)
                    }
                }
            }
        }
        .listStyle(.plain)
    }

    private func load() async {
        isLoading = true
        do {
            async let p = service.get(id: projectId)
            async let t = service.listTasks(projectId: projectId)
            async let te = service.listTimeEntries(projectId: projectId)
            async let m = service.listMilestones(projectId: projectId)
            let (proj, taskResult, timeResult, mResult) = try await (p, t, te, m)
            project = proj; tasks = taskResult.data; timeEntries = timeResult.data; milestones = mResult.data
        } catch {}
        isLoading = false
    }
}

// MARK: - Project Form

struct ProjectFormView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var description = ""
    @State private var billingType = "hourly"
    @State private var budget = ""
    @State private var hourlyRate = ""
    @State private var isSubmitting = false
    @State private var error: String?
    private let service = ProjectService()
    var onComplete: (() -> Void)?

    var body: some View {
        NavigationView {
            Form {
                Section("Project Info") {
                    TextField("Project Name", text: $name)
                    TextEditor(text: $description).frame(minHeight: 60)
                }
                Section("Billing") {
                    Picker("Type", selection: $billingType) {
                        Text("Hourly").tag("hourly")
                        Text("Fixed").tag("fixed")
                        Text("Milestone").tag("milestone")
                        Text("Non-billable").tag("non_billable")
                    }
                    TextField("Budget", text: $budget).keyboardType(.decimalPad)
                    if billingType == "hourly" {
                        TextField("Hourly Rate", text: $hourlyRate).keyboardType(.decimalPad)
                    }
                }
                if let error = error {
                    Section { Text(error).foregroundColor(.dubblDestructive) }
                }
            }
            .navigationTitle("New Project")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) { Button("Cancel") { dismiss() }.foregroundColor(.dubblPrimary) }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Create") { Task { await submit() } }
                        .font(.body.weight(.semibold)).foregroundColor(.dubblPrimary)
                        .disabled(name.isEmpty || isSubmitting)
                }
            }
        }
    }

    private func submit() async {
        isSubmitting = true; error = nil
        do {
            _ = try await service.create(ProjectCreate(
                name: name,
                description: description.isEmpty ? nil : description,
                billingType: billingType,
                budget: Int((Double(budget) ?? 0) * 100),
                hourlyRate: Int((Double(hourlyRate) ?? 0) * 100)
            ))
            onComplete?(); dismiss()
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        isSubmitting = false
    }
}
