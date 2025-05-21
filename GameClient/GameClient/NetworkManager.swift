// GameClient/NetworkManager.swift
import Foundation
import Combine

class NetworkManager: ObservableObject {
    @Published var gameText: String = "로딩 중…"
    private var cancellables = Set<AnyCancellable>()
    
    func fetchGameText() {
        guard let url = URL(string: "http://localhost:3000/game") else {
            print("⚠️ 잘못된 URL")
            return
        }
        
        URLSession.shared.dataTaskPublisher(for: url)
            .map(\.data)
            .decode(type: GameResponse.self, decoder: JSONDecoder())
            .map { $0.text }
            .receive(on: DispatchQueue.main)
            .sink { completion in
                switch completion {
                case .finished:
                    break
                case .failure(let error):
                    print("🛑 fetchGameText error:", error)
                    self.gameText = "불러오기 실패"
                }
            } receiveValue: { text in
                print("✅ fetchGameText success:", text)
                self.gameText = text
            }
            .store(in: &cancellables)
    }
}
